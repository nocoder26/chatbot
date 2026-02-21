/**
 * Micro-Agent Architecture - Central exports
 * Parallel execution for maximum speed and accuracy.
 */

// Chat Pipeline Agents
export { triageQuery, isTriageAvailable } from './triageAgent.js';
export { executeRetrievalSwarm } from './retrievalSwarm.js';
export { synthesizeResponse, isSynthesizerAvailable } from './clinicalSynthesizer.js';

// Bloodwork Pipeline Agents
export { extractBiomarkers, isExtractorAvailable, identifyMissingTests, STANDARD_FERTILITY_PANEL } from './biomarkerExtractor.js';
export { synthesizeBloodworkAnalysis, isBloodworkSynthesizerAvailable } from './bloodworkSynthesizer.js';
