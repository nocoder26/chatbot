"""
Standalone script to ingest PDF documents into Pinecone vector database.

Usage:
    cd backend
    python ingest_local.py
"""

import os
import glob
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone, ServerlessSpec

# Load environment variables
load_dotenv()

# Configuration
INDEX_NAME = "reproductive-health"
EMBEDDING_DIMENSION = 1536
CHUNK_SIZE = 600
CHUNK_OVERLAP = 100
BATCH_SIZE = 100


def init_pinecone():
    """Initialize Pinecone client and ensure index exists."""
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

    # Check if index exists, create if missing
    existing_indexes = [idx.name for idx in pc.list_indexes()]

    if INDEX_NAME not in existing_indexes:
        print(f"Creating index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=EMBEDDING_DIMENSION,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1",
            ),
        )
        print(f"Index '{INDEX_NAME}' created successfully.")
    else:
        print(f"Index '{INDEX_NAME}' already exists.")

    return pc.Index(INDEX_NAME)


def load_and_split_pdfs(data_dir: str):
    """Load PDFs and split into chunks with metadata."""
    pdf_files = glob.glob(os.path.join(data_dir, "*.pdf"))

    if not pdf_files:
        print(f"No PDF files found in {data_dir}")
        return []

    print(f"Found {len(pdf_files)} PDF file(s)")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )

    all_chunks = []

    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        print(f"Processing: {filename}")

        try:
            loader = PyPDFLoader(pdf_path)
            pages = loader.load()

            for page in pages:
                page_num = page.metadata.get("page", 0)
                chunks = text_splitter.split_text(page.page_content)

                for chunk in chunks:
                    all_chunks.append({
                        "text": chunk,
                        "metadata": {
                            "source": filename,
                            "page": page_num,
                        },
                    })

            print(f"  - Extracted {len(pages)} pages")

        except Exception as e:
            print(f"  - Error processing {filename}: {e}")

    return all_chunks


def upsert_to_pinecone(index, chunks, embeddings):
    """Embed chunks and upsert to Pinecone in batches."""
    total_chunks = len(chunks)
    print(f"\nEmbedding and upserting {total_chunks} chunks...")

    upserted_count = 0

    for i in range(0, total_chunks, BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [chunk["text"] for chunk in batch]

        # Generate embeddings
        vectors = embeddings.embed_documents(texts)

        # Prepare upsert data
        upsert_data = []
        for j, (chunk, vector) in enumerate(zip(batch, vectors)):
            doc_id = f"doc_{i + j}"
            upsert_data.append({
                "id": doc_id,
                "values": vector,
                "metadata": {
                    **chunk["metadata"],
                    "text": chunk["text"],
                },
            })

        # Upsert batch
        index.upsert(vectors=upsert_data)
        upserted_count += len(batch)
        print(f"  - Upserted {upserted_count}/{total_chunks} chunks")

    return upserted_count


def main():
    """Main ingestion workflow."""
    print("=" * 50)
    print("PDF Ingestion to Pinecone")
    print("=" * 50)

    # Determine data directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "data")

    # Initialize Pinecone
    index = init_pinecone()

    # Load and split PDFs
    chunks = load_and_split_pdfs(data_dir)

    if not chunks:
        print("\nNo chunks to process. Exiting.")
        return

    # Initialize embeddings
    embeddings = OpenAIEmbeddings(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="text-embedding-ada-002",
    )

    # Upsert to Pinecone
    upserted = upsert_to_pinecone(index, chunks, embeddings)

    # Summary
    print("\n" + "=" * 50)
    print("Ingestion Complete!")
    print("=" * 50)
    print(f"Total chunks processed: {upserted}")
    print(f"Index: {INDEX_NAME}")
    print("=" * 50)


if __name__ == "__main__":
    main()
