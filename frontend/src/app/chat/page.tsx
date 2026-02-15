// frontend/src/app/chat/page.tsx

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false); // NEW: Prevents black screen
  const [loadingStep, setLoadingStep] = useState(0);
  const [langCode, setLangCode] = useState("en");

  useEffect(() => {
    // 1. Recover language safely
    const saved = localStorage.getItem("izana_language") || "en";
    setLangCode(saved);
    
    // 2. Mark as ready to render topic grid
    setIsReady(true);
  }, []);

  if (!isReady) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#f9f9f9] dark:bg-[#212121]">
      <Loader2 className="w-8 h-8 animate-spin text-[#3231b1]" />
    </div>
  );

  // Rest of your component rendering logic...
