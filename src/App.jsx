import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Mic, Type, StopCircle, Loader2, Check, AlertCircle, RefreshCw,
  User, CheckSquare, ThumbsUp, ThumbsDown, HelpCircle, Save, Info, ShieldAlert, Database
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
  doc,
  setDoc,
  getDoc,
  increment,
  where,
  query,
  limit,
  getDocs,
  onSnapshot,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "MOCK_API_KEY_FOR_PREVIEW_MODE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "MOCK_AUTH_DOMAIN_FOR_PREVIEW_MODE",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "MOCK_PROJECT_ID_FOR_PREVIEW_MODE",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "MOCK_STORAGE_BUCKET_FOR_PREVIEW_MODE",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "MOCK_MESSAGING_SENDER_ID_FOR_PREVIEW_MODE",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "MOCK_APP_ID_FOR_PREVIEW_MODE",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "MOCK_MEASUREMENT_ID"
};

const appId = "burushaski-translation-hub";
const DAILY_WRITE_LIMIT = 18000; // A safe buffer below the no-cost daily quota from Firestore

// Initialize Firebase
// const app = initializeApp(firebaseConfig);

// --- Curated Standardized Benchmark Fallbacks (Used if Firestore is empty) ---
const FALLBACK_BENCHMARKS = {
  flores: [
    { id: "FLORES_200_001", text: "The search was suspended late Tuesday due to high winds and rough seas, but resumed at sunrise on Wednesday." },
    { id: "FLORES_200_002", text: "Scientists have discovered a new species of deep-sea jellyfish that glows with a brilliant blue light." },
    { id: "FLORES_200_003", text: "The local government announced plans to construct a new hospital and three community clinics in the region." },
    { id: "FLORES_200_004", text: "Large-scale agriculture has transformed the river delta, leading to concerns about water quality and soil erosion." },
    { id: "FLORES_200_005", text: "The telescope can capture detailed images of distant galaxies that were formed billions of years ago." },
    { id: "FLORES_200_006", text: "Health experts suggest that drinking clean, filtered water is the single most effective way to prevent seasonal infections." },
    { id: "FLORES_200_007", text: "The trade route through the mountain pass has connected the coastal plains with the interior valleys for centuries." }
  ],
  tatoeba: [
    { id: "TATOEBA_001", text: "Where can I find a local guide who speaks English and Burushaski?" },
    { id: "TATOEBA_002", text: "The water in this mountain stream is very cold and clean." },
    { id: "TATOEBA_003", text: "Can you tell me how to get to the historic Baltit Fort?" },
    { id: "TATOEBA_004", text: "My grandfather used to tell us old folk tales by the fireplace in winter." },
    { id: "TATOEBA_005", text: "Please take care of yourself during your journey through the high mountain passes." },
    { id: "TATOEBA_006", text: "Is it going to rain in the valley today, or will it remain sunny?" },
    { id: "TATOEBA_007", text: "We harvested fresh sweet cherries and apricots from our family orchard yesterday." }
  ]
};

// --- Helper Utilities ---
const getRandomPrompt = (promptArray, lastPrompt) => {
  let newPrompt = lastPrompt;
  if (!promptArray || promptArray.length === 0) return null;
  if (promptArray.length === 1) return promptArray[0];
  while (newPrompt === lastPrompt) {
    const randomIndex = Math.floor(Math.random() * promptArray.length);
    newPrompt = promptArray[randomIndex];
  }
  return newPrompt;
};

// --- Reusable UI Components ---

const TabButton = ({ children, onClick, isActive }) => (
  <button
    onClick={onClick}
    className={`
      flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 
      font-semibold text-sm sm:text-base rounded-t-lg border-b-4
      transition-all duration-300 ease-in-out transform
      hover:scale-[1.02] active:scale-[0.98]
      focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
      ${isActive
        ? 'border-blue-600 text-blue-700 bg-blue-50/30'
        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
      }
    `}
  >
    {children}
  </button>
);

const PromptDisplay = ({ label, prompt, sourceTag, sourceId, onSkip }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <label className="block text-sm font-semibold text-gray-700 uppercase tracking-wider">
          {label}
        </label>
        {sourceTag && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-tight">
            <Database className="w-2.5 h-2.5" /> {sourceTag} ({sourceId})
          </span>
        )}
      </div>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="group flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-all bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md active:scale-95"
          title="Get a new prompt"
        >
          <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
          Skip
        </button>
      )}
    </div>
    <div className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-inner min-h-[72px] flex items-center animate-fadeIn">
      <p className="text-slate-800 text-base font-medium leading-relaxed">{prompt}</p>
    </div>
  </div>
);

const StyledTextarea = ({ id, label, value, onChange, placeholder, rows = 4 }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-semibold text-gray-700 uppercase tracking-wider">
      {label}
    </label>
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full p-3.5 border border-slate-300 rounded-xl shadow-xs focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-400 transition-all duration-200 text-slate-800 placeholder-slate-400"
      required
    />
  </div>
);

const DialectSelector = ({ selected, onChange }) => (
  <fieldset className="space-y-2">
    <legend className="block text-sm font-semibold text-gray-700 uppercase tracking-wider mb-1">
      Burushaski Dialect
    </legend>
    <div className="grid grid-cols-2 gap-4">
      {['Hunza', 'Nagar'].map((dialect) => (
        <label
          key={dialect}
          className={`
            flex items-center gap-3 p-4 border rounded-xl cursor-pointer select-none
            transition-all duration-300 ease-out shadow-xs transform hover:-translate-y-0.5 active:translate-y-0
            ${selected === dialect.toLowerCase()
              ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-100/50 scale-[1.01]'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
            }
          `}
        >
          <input
            type="radio"
            name="dialect"
            value={dialect.toLowerCase()}
            checked={selected === dialect.toLowerCase()}
            onChange={(e) => onChange(e.target.value)}
            className="h-4.5 w-4.5 text-blue-600 focus:ring-blue-500 border-slate-300 accent-blue-600"
          />
          <span className="font-semibold text-slate-800 text-sm sm:text-base">{dialect}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

const SubmitButton = ({ status, children, icon: Icon = Save }) => (
  <button
    type="submit"
    disabled={status === 'submitting'}
    className={`
      w-full flex items-center justify-center gap-2 px-6 py-3.5
      font-bold text-white rounded-xl shadow-md
      transition-all duration-300 ease-in-out
      transform hover:scale-[1.01] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]
      focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200
      ${status === 'success' ? 'bg-emerald-600 shadow-emerald-100 animate-popIn' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}
      ${status === 'submitting' ? 'bg-blue-400 cursor-not-allowed shadow-none' : ''}
    `}
  >
    {status === 'submitting' && <Loader2 className="w-5 h-5 animate-spin" />}
    {status === 'success' && <Check className="w-5 h-5 animate-popIn" />}
    {status === 'idle' && <Icon className="w-5 h-5" />}
    {status === 'idle' && <span>{children}</span>}
    {status === 'submitting' && <span>Saving Contribution...</span>}
    {status === 'success' && <span>Submitted Successfully!</span>}
  </button>
);

const StatusMessage = ({ status, message }) => {
  if (status === 'idle' || !message) return null;

  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <div
      aria-live="polite"
      className={`
        p-4 rounded-xl flex items-start gap-3 text-sm font-medium border animate-popIn
        ${isSuccess ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : ''}
        ${isError ? 'bg-rose-50 border-rose-100 text-rose-800' : ''}
      `}
    >
      {isSuccess && <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
      {isError && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
      <span className="leading-relaxed">{message}</span>
    </div>
  );
};

const GlobalLoader = () => (
  <div className="min-h-screen w-full flex flex-col justify-center items-center bg-gradient-to-b from-blue-50 to-white text-gray-900 font-sans">
    <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
    <p className="text-lg text-slate-700 font-semibold mt-4">Connecting to collection hub...</p>
    <p className="text-sm text-slate-400 mt-2 max-w-xs text-center leading-relaxed">
      Performing secure authentication handshake with Firebase servers...
    </p>
  </div>
);

const QuotaReachedScreen = () => (
  <div className="min-h-screen w-full flex flex-col justify-center items-center bg-slate-50 px-4 py-8 font-sans text-center">
    <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 space-y-6 animate-popIn">
      <div className="mx-auto w-16 h-16 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center text-blue-600">
        <Lock className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-extrabold text-slate-800">Daily Target Reached!</h2>
      <p className="text-slate-600 leading-relaxed">
        Wow! Our community has submitted enough linguistic data for today to keep our researchers busy. To manage server costs, we pause collections once our daily milestone is hit.
      </p>
      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
        <p className="text-emerald-800 font-bold text-sm">Please come back tomorrow to submit more translations.</p>
      </div>
    </div>
  </div>
);

const ConnectionDiagnosticScreen = ({ errorMsg }) => {
  const isUsingMockKey = firebaseConfig.apiKey === "MOCK_API_KEY_FOR_PREVIEW_MODE";

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-slate-50 px-4 py-8 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8 space-y-6 animate-popIn">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Connection Handshake Failed</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            The application was unable to connect or authenticate with the Firebase backend services.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs font-mono text-rose-700 overflow-x-auto">
            <div className="font-bold uppercase tracking-wider mb-1">Error Signature:</div>
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Troubleshooting Checklist:</h3>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-2.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold shrink-0 mt-0.5">1</span>
              <span>
                {isUsingMockKey ? (
                  <strong className="text-rose-600">Action Required: Your local config is still using Mock Placeholders. </strong>
                ) : (
                  <strong>Verify config credentials: </strong>
                )}
                Ensure you replaced the <code>firebaseConfig</code> credentials inside your local <code>App.jsx</code> with your actual keys from the Firebase Console.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold shrink-0 mt-0.5">2</span>
              <span>
                <strong>Enable Anonymous Login:</strong> Go to your <strong>Firebase Console &gt; Build &gt; Authentication &gt; Sign-in method</strong>, select <strong>Anonymous</strong>, click <strong>Enable</strong>, and save.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold shrink-0 mt-0.5">3</span>
              <span>
                <strong>Initialize Database &amp; Storage:</strong> Ensure you have clicked <strong>Create Database</strong> inside Firestore and <strong>Get Started</strong> in Cloud Storage under the Build menu.
              </span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-100 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Retry Connection Handshake
        </button>
      </div>
    </div>
  );
};

const ContributionCounter = ({ count }) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (count > 0) {
      const timer = setTimeout(() => {
        setAnimate(true);
        const resetTimer = setTimeout(() => setAnimate(false), 450);
        return () => clearTimeout(resetTimer);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [count]);

  return (
    <div className={`bg-white/70 backdrop-blur-sm border border-blue-100 rounded-full px-4 py-2 text-sm font-medium text-blue-800 transition-all duration-300 shadow-sm ${animate ? 'animate-counterBump ring-4 ring-blue-200' : ''}`}>
      Your Total Contributions: <span className="font-bold text-lg text-blue-900">{count}</span>
    </div>
  );
};

const AudioPlayer = ({ storage, storagePath }) => {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!storage || !storagePath) return;

    const audioRef = ref(storage, storagePath);

    (async () => {
      try {
        const url = await getDownloadURL(audioRef);
        setAudioUrl(url);
        setLoading(false);
      } catch (err) {
        console.error("Error getting download URL:", err);
        setError("Could not load audio file.");
        setLoading(false);
      }
    })();
  }, [storage, storagePath]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-lg animate-pulse">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        <span className="text-sm text-slate-600 font-medium">Loading audio...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-rose-100 rounded-lg">
        <AlertCircle className="w-5 h-5 text-rose-600" />
        <span className="text-sm text-rose-700 font-medium">{error}</span>
      </div>
    );
  }

  return <audio controls src={audioUrl} className="w-full focus:outline-none rounded-lg" />;
};

// --- Main Feature Components ---

/**
 * Form for collecting text data.
 */
const TextCollectionForm = ({ db, userId, profileDocRef, activeBenchmarkData }) => {
  const [mode, setMode] = useState('prompt'); // 'prompt' or 'custom'
  const [subSource, setSubSource] = useState('tatoeba'); // 'flores' or 'tatoeba'
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [burushaski, setBurushaski] = useState('');
  const [customEnglish, setCustomEnglish] = useState('');
  const [dialect, setDialect] = useState('hunza');
  const [status, setStatus] = useState('idle'); // 'idle', 'submitting', 'success', 'error'
  const [message, setMessage] = useState('');

  const getNewPrompt = useCallback((targetSource = subSource) => {
    const list = activeBenchmarkData[targetSource] || FALLBACK_BENCHMARKS[targetSource];
    const newPrompt = getRandomPrompt(list);
    setCurrentPrompt(newPrompt);
  }, [subSource, activeBenchmarkData]);

  useEffect(() => {
    if (!activeBenchmarkData) return;
    const promptSource = subSource;
    const timer = window.setTimeout(() => getNewPrompt(promptSource), 0);
    return () => window.clearTimeout(timer);
  }, [subSource, activeBenchmarkData, getNewPrompt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const burushaskiText = burushaski.trim();
    const englishText = mode === 'prompt' ? currentPrompt?.text : customEnglish.trim();

    if (!burushaskiText) {
      setStatus('error');
      setMessage('Please provide the Burushaski translation.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    if (!englishText) {
      setStatus('error');
      setMessage('Please select or write an English sentence.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const collectionPath = `artifacts/${appId}/public/data/text_contributions`;
      const collectionRef = collection(db, collectionPath);

      await addDoc(collectionRef, {
        promptEnglish: englishText,
        translationBurushaski: burushaskiText,
        dialect: dialect,
        userId: userId,
        isCustom: mode === 'custom',
        benchmarkSource: mode === 'prompt' ? subSource : 'none',
        benchmarkId: mode === 'prompt' ? (currentPrompt?.id || 'unknown') : 'none',
        createdAt: Timestamp.now(),
        validationCount: 0,
        validated: false,

        validationStats: {
          correct: 0,
          incorrect: 0,
          unsure: 0
        },

        confidenceScore: 0,
        finalLabel: "pending"

      });

      await setDoc(profileDocRef, { count: increment(1) }, { merge: true });

      setStatus('success');
      setMessage('Your translation was added to the standard corpus!');
      setBurushaski('');
      setCustomEnglish('');
      setDialect('hunza');
      if (mode === 'prompt') getNewPrompt(subSource);

      setTimeout(() => setStatus('idle'), 3000);

    } catch (err) {
      console.error("Error submitting text data:", err);
      setStatus('error');
      setMessage('Could not submit. Check security rules or network.');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Mode Selector Option */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-xs transition-all duration-300">
        <button
          type="button"
          onClick={() => { setMode('prompt'); setMessage(''); setStatus('idle'); }}
          className={`flex-1 py-1.5 px-3 text-sm font-semibold rounded-lg transition-all transform hover:scale-[1.02] active:scale-95 ${mode === 'prompt'
            ? 'bg-white text-blue-700 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          Benchmark Task
        </button>
        <button
          type="button"
          onClick={() => { setMode('custom'); setMessage(''); setStatus('idle'); }}
          className={`flex-1 py-1.5 px-3 text-sm font-semibold rounded-lg transition-all transform hover:scale-[1.02] active:scale-95 ${mode === 'custom'
            ? 'bg-white text-blue-700 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          My Own Text
        </button>
      </div>

      {mode === 'prompt' && (
        <div className="flex items-center gap-2 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 max-w-md animate-fadeIn">
          <span className="text-xs font-bold text-blue-800 uppercase tracking-wider shrink-0">Benchmark Source:</span>
          <button
            type="button"
            onClick={() => setSubSource('tatoeba')}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${subSource === 'tatoeba'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
              }`}
          >
            Tatoeba (Daily Spoken)
          </button>
          <button
            type="button"
            onClick={() => setSubSource('flores')}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${subSource === 'flores'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
              }`}
          >
            FLORES-200 (Complex/News)
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'prompt' ? (
          currentPrompt ? (
            <PromptDisplay
              label="Translate the English Sentence"
              prompt={currentPrompt.text}
              sourceTag={subSource === 'tatoeba' ? 'Tatoeba Benchmark' : 'FLORES-200'}
              sourceId={currentPrompt.id}
              onSkip={() => getNewPrompt(subSource)}
            />
          ) : (
            <div className="flex items-center gap-2 p-4 bg-slate-50 border rounded-xl"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Connecting to benchmark catalog...</div>
          )
        ) : (
          <StyledTextarea
            id="custom-english-text"
            label="Your English Word / Sentence"
            value={customEnglish}
            onChange={(e) => setCustomEnglish(e.target.value)}
            placeholder="Write your custom English sentence or phrase here..."
          />
        )}

        <StyledTextarea
          id="burushaski-text"
          label="Your Standardized Romanised Burushaski Translation"
          value={burushaski}
          onChange={(e) => setBurushaski(e.target.value)}
          placeholder="e.g., unay guik besan bila / ja durowan bila jimalay thap mo"
        />

        <DialectSelector selected={dialect} onChange={setDialect} />
        <StatusMessage status={status} message={message} />
        <SubmitButton status={status} icon={Check}>
          Submit Translation
        </SubmitButton>
      </form>
    </div>
  );
};

/**
 * Form for collecting audio data using the "Write First, Speak Second" workflow.
 */
const AudioCollectionForm = ({ db, storage, userId, profileDocRef, activeBenchmarkData }) => {
  const [mode, setMode] = useState('prompt'); // 'prompt' or 'custom'
  const [subSource, setSubSource] = useState('tatoeba'); // 'flores' or 'tatoeba'
  const [currentPrompt, setCurrentPrompt] = useState(null);

  const [customEnglish, setCustomEnglish] = useState('');
  const [burushaskiText, setBurushaskiText] = useState('');
  const [dialect, setDialect] = useState('hunza');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const [recordingState, setRecordingState] = useState('idle');
  const [audioURL, setAudioURL] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const getNewPrompt = useCallback((targetSource = subSource) => {
    const list = activeBenchmarkData[targetSource] || FALLBACK_BENCHMARKS[targetSource];
    const newPrompt = getRandomPrompt(list);
    setCurrentPrompt(newPrompt);
  }, [subSource, activeBenchmarkData]);

  useEffect(() => {
    if (!activeBenchmarkData) return;
    const promptSource = subSource;
    const timer = window.setTimeout(() => getNewPrompt(promptSource), 0);
    return () => window.clearTimeout(timer);
  }, [subSource, activeBenchmarkData, getNewPrompt]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  const startRecording = async () => {
    setRecordingState('permission');
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(null);
    setAudioBlob(null);
    setMessage('');
    setStatus('idle');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioURL(url);
        setRecordingState('recorded');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setRecordingState('recording');
    } catch (err) {
      console.error("Error getting media device:", err);
      setRecordingState('idle');
      setStatus('error');
      setMessage('Could not access microphone. Please check permissions.');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const englishText = mode === 'prompt' ? currentPrompt?.text : customEnglish.trim();
    const burushaskiTranscript = burushaskiText.trim();

    if (!burushaskiTranscript) {
      setStatus('error');
      setMessage('Please write the Burushaski translation in Step 1 first.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    if (!audioBlob) {
      setStatus('error');
      setMessage('Please record yourself reading the text aloud in Step 2.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    if (!englishText) {
      setStatus('error');
      setMessage('Please provide an English sentence.');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const audioFileName = `${userId}_${new Date().getTime()}.wav`;
      const storagePath = `artifacts/${appId}/public/audio/${audioFileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, audioBlob);

      const collectionPath = `artifacts/${appId}/public/data/audio_contributions`;
      const collectionRef = collection(db, collectionPath);

      await addDoc(collectionRef, {
        promptEnglish: englishText,
        translationBurushaski: burushaskiTranscript,
        dialect: dialect,
        storagePath: storagePath,
        userId: userId,
        isCustom: mode === 'custom',
        benchmarkSource: mode === 'prompt' ? subSource : 'none',
        benchmarkId: mode === 'prompt' ? (currentPrompt?.id || 'unknown') : 'none',
        createdAt: Timestamp.now(),
        validationCount: 0,
        validated: false,

        validationStats: {
          correct: 0,
          incorrect: 0,
          unsure: 0
        },

        confidenceScore: 0,
        finalLabel: "pending"

      });

      await setDoc(profileDocRef, { count: increment(1) }, { merge: true });

      setStatus('success');
      setMessage('Your tri-modal contribution (Text + Audio) has been recorded!');
      setCustomEnglish('');
      setBurushaskiText('');
      setDialect('hunza');
      setAudioURL(null);
      setAudioBlob(null);
      setRecordingState('idle');
      if (mode === 'prompt') getNewPrompt(subSource);

      setTimeout(() => setStatus('idle'), 3000);

    } catch (err) {
      console.error("Error submitting audio data:", err);
      setStatus('error');
      setMessage('Could not submit. Please try again.');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="animate-fadeIn space-y-4">
      {/* Mode Selector Option */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-xs transition-all duration-300">
        <button
          type="button"
          onClick={() => { setMode('prompt'); setMessage(''); setStatus('idle'); }}
          className={`flex-1 py-1.5 px-3 text-sm font-semibold rounded-lg transition-all transform hover:scale-[1.02] active:scale-95 ${mode === 'prompt'
            ? 'bg-white text-blue-700 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          Benchmark Task
        </button>
        <button
          type="button"
          onClick={() => { setMode('custom'); setMessage(''); setStatus('idle'); }}
          className={`flex-1 py-1.5 px-3 text-sm font-semibold rounded-lg transition-all transform hover:scale-[1.02] active:scale-95 ${mode === 'custom'
            ? 'bg-white text-blue-700 shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          My Own Speech
        </button>
      </div>

      {mode === 'prompt' && (
        <div className="flex items-center gap-2 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 max-w-md animate-fadeIn">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider shrink-0">Benchmark Source:</span>
          <button
            type="button"
            onClick={() => setSubSource('tatoeba')}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${subSource === 'tatoeba'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
              }`}
          >
            Tatoeba (Spoken)
          </button>
          <button
            type="button"
            onClick={() => setSubSource('flores')}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${subSource === 'flores'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
              }`}
          >
            FLORES-200 (News)
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Source Definition */}
        <div className="space-y-4">
          {mode === 'prompt' ? (
            currentPrompt ? (
              <PromptDisplay
                label="English Source Sentence"
                prompt={currentPrompt.text}
                sourceTag={subSource === 'tatoeba' ? 'Tatoeba Benchmark' : 'FLORES-200'}
                sourceId={currentPrompt.id}
                onSkip={() => getNewPrompt(subSource)}
              />
            ) : (
              <div className="flex items-center gap-2 p-4 bg-slate-50 border rounded-xl"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /> Connecting to benchmark catalog...</div>
            )
          ) : (
            <StyledTextarea
              id="custom-english-text"
              label="Your English Word / Sentence"
              value={customEnglish}
              onChange={(e) => setCustomEnglish(e.target.value)}
              placeholder="Write your custom English sentence or phrase here..."
              rows={2}
            />
          )}
        </div>

        {/* STEP 1: Write First */}
        <div className="p-5 border-2 border-slate-200 rounded-2xl bg-white shadow-sm space-y-3 relative">
          <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-800">1</span>
            Write First
          </div>
          <p className="text-sm font-medium text-slate-600 leading-relaxed pt-2">
            Translate the English sentence above and type it out in Burushaski. You will read from this script.
          </p>
          <StyledTextarea
            id="burushaski-transcript"
            label=""
            value={burushaskiText}
            onChange={(e) => setBurushaskiText(e.target.value)}
            placeholder="Type your Burushaski translation script here..."
            rows={3}
          />
        </div>

        {/* STEP 2: Speak Second */}
        <div className="p-6 border-2 border-emerald-200 rounded-2xl bg-emerald-50/30 shadow-sm flex flex-col items-center gap-4 relative transition-all duration-300">
          <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 border border-emerald-200">2</span>
            Read Aloud
          </div>

          <p className="text-sm font-medium text-slate-700 mt-2 text-center max-w-sm">
            Ready? Hit record and simply read your Burushaski text from Step 1 aloud.
          </p>

          <div className="relative flex items-center justify-center my-2">
            {recordingState === 'recording' && (
              <>
                <div className="absolute w-24 h-24 bg-red-100 rounded-full animate-ripple" />
                <div className="absolute w-20 h-20 bg-red-200/60 rounded-full animate-ripple [animation-delay:0.8s]" />
              </>
            )}

            {recordingState === 'idle' && (
              <button
                type="button"
                onClick={startRecording}
                className="relative z-10 flex items-center justify-center w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-90"
              >
                <Mic className="w-6 h-6" />
              </button>
            )}

            {recordingState === 'permission' && (
              <div className="relative z-10 flex items-center justify-center w-16 h-16 bg-slate-200 text-slate-500 rounded-full shadow-inner animate-pulse">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}

            {recordingState === 'recording' && (
              <button
                type="button"
                onClick={stopRecording}
                className="relative z-10 flex items-center justify-center w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-90"
              >
                <StopCircle className="w-6 h-6 animate-pulse" />
              </button>
            )}

            {recordingState === 'recorded' && (
              <button
                type="button"
                onClick={startRecording}
                className="relative z-10 flex items-center justify-center w-16 h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-90"
              >
                <Mic className="w-6 h-6" />
              </button>
            )}
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 animate-fadeIn">
            {recordingState === 'idle' && "Ready to Record"}
            {recordingState === 'permission' && "Activating Mic..."}
            {recordingState === 'recording' && <span className="text-red-600 font-bold">Recording active • Read your text now</span>}
            {recordingState === 'recorded' && <span className="text-emerald-600 font-bold">Voice Captured Successfully</span>}
          </span>

          {audioURL && (
            <div className="w-full mt-2 pt-4 border-t border-emerald-200/60 animate-fadeIn">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Review Audio:</p>
              <audio controls src={audioURL} className="w-full focus:outline-none rounded-lg" />
            </div>
          )}
        </div>

        <DialectSelector selected={dialect} onChange={setDialect} />
        <StatusMessage status={status} message={message} />
        <SubmitButton status={status} icon={Check}>
          Submit Tri-Modal Dataset
        </SubmitButton>
      </form>
    </div>
  );
};

/**
 * Form for validating data from other users.
 */
const ValidationForm = ({ db, storage, userId }) => {
  const [contribution, setContribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState('idle');
  const [voted, setVoted] = useState(false);

  // ✅ FETCH LOGIC
  const fetchContribution = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setContribution(null);
    setVoted(false);
    setStatus('idle');

    try {
      const types = ['text', 'audio'];
      let allDocs = [];

      for (const type of types) {
        const collectionName =
          type === 'text' ? 'text_contributions' : 'audio_contributions';

        const collectionRef = collection(
          db,
          `artifacts/${appId}/public/data/${collectionName}`
        );

        const q = query(
          collectionRef,
          where("userId", "!=", userId),
          where("validated", "==", false),
          orderBy("validationCount", "asc"),
          limit(10)
        );

        const snapshot = await getDocs(q);

        snapshot.docs.forEach(doc => {
          allDocs.push({ doc, type });
        });
      }

      if (allDocs.length === 0) {
        setMessage("No new contributions available.");
        setLoading(false);
        return;
      }

      // ✅ Fetch user's previous validations
      const valRef = collection(
        db,
        `artifacts/${appId}/public/data/validations`
      );

      const valQuery = query(
        valRef,
        where("validatorId", "==", userId),
        limit(200)
      );

      const valSnapshot = await getDocs(valQuery);

      const validatedIds = valSnapshot.docs.map(
        doc => doc.data().contributionId
      );

      // ✅ Filter already seen
      const unseenDocs = allDocs.filter(item =>
        !validatedIds.includes(item.doc.id)
      );

      // ✅ Prevent duplicates entirely
      if (unseenDocs.length === 0) {
        setLoading(false);
        setMessage("You have already reviewed all available contributions.");
        return;
      }

      const pool = unseenDocs;

      const randomItem =
        pool[Math.floor(Math.random() * pool.length)];

      setContribution({
        id: randomItem.doc.id,
        type: randomItem.type,
        data: randomItem.doc.data()
      });

      setLoading(false);

    } catch (err) {
      console.error("Error fetching contribution:", err);
      setStatus('error');
      setMessage(err.message || "Failed to load data.");
      setLoading(false);
    }
  }, [db, userId]);

  useEffect(() => {
    if (!db || !userId) return;
    fetchContribution();
  }, [db, userId, fetchContribution]);

  // ✅ HANDLE VOTE (with scoring + safety)
  const handleVote = async (vote) => {
    if (!contribution || voted) return;

    setVoted(true);
    setStatus('submitting');

    try {
      // ✅ prevent invalid votes
      if (!["correct", "incorrect", "unsure"].includes(vote)) {
        throw new Error("Invalid vote type");
      }

      // ✅ prevent duplicate voting
      const existingQuery = query(
        collection(db, `artifacts/${appId}/public/data/validations`),
        where("validatorId", "==", userId),
        where("contributionId", "==", contribution.id),
        limit(1)
      );

      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        throw new Error("You already validated this item.");
      }

      // ✅ save validation
      await addDoc(
        collection(db, `artifacts/${appId}/public/data/validations`),
        {
          contributionId: contribution.id,
          contributionType: contribution.type,
          validatorId: userId,
          vote,
          validatedAt: Timestamp.now(),
        }
      );

      // ✅ correct collection
      const contributionCollection =
        contribution.type === "text"
          ? "text_contributions"
          : "audio_contributions";

      const contributionRef = doc(
        db,
        `artifacts/${appId}/public/data/${contributionCollection}`,
        contribution.id
      );

      // ✅ current stats
      const currentStats = contribution.data.validationStats || {
        correct: 0,
        incorrect: 0,
        unsure: 0
      };

      // ✅ FIX 3: safe copy
      const updatedStats = { ...currentStats };

      updatedStats[vote] += 1;

      // ✅ totals
      const totalVotes =
        updatedStats.correct +
        updatedStats.incorrect +
        updatedStats.unsure;

      // ✅ FIX 5: prevent abuse (ignore unsure)
      const decisiveVotes =
        updatedStats.correct + updatedStats.incorrect;

      const confidence =
        decisiveVotes > 0
          ? updatedStats.correct / decisiveVotes
          : 0;

      // ✅ FIX 6: system rules
      let finalLabel = "pending";

      if (totalVotes >= 3) {
        if (confidence >= 0.7) finalLabel = "correct";
        else if (confidence <= 0.3) finalLabel = "incorrect";
        else finalLabel = "uncertain";
      }

      const MAX_VALIDATIONS = 5;
      const isValidated = totalVotes >= MAX_VALIDATIONS;

      // ✅ update Firestore
      await updateDoc(contributionRef, {
        validationCount: increment(1),
        validationStats: updatedStats,
        confidenceScore: confidence,
        finalLabel: finalLabel,
        validated: isValidated
      });

      setStatus('success');
      setMessage("Vote recorded! Loading next...");

      setTimeout(fetchContribution, 1500);

    } catch (err) {
      console.error("Error submitting validation:", err);
      setStatus('error');
      setMessage(err.message || "Vote failed.");
      setVoted(false);
    }
  };

  // ✅ render contribution
  const renderContribution = () => {
    if (!contribution) return null;

    const { type, data } = contribution;

    return (
      <div className="space-y-4">
        <PromptDisplay
          label="Original English"
          prompt={data.promptEnglish}
        />

        <div>
          <p className="font-semibold text-sm text-gray-600">
            Burushaski ({data.dialect})
          </p>
          <p className="bg-blue-50 p-3 rounded">
            {data.translationBurushaski}
          </p>
        </div>

        {type === 'audio' && (
          <AudioPlayer
            storage={storage}
            storagePath={data.storagePath}
          />
        )}
      </div>
    );
  };

  // ✅ FIX 1 & 2: always-safe UI values
  const stats = contribution?.data?.validationStats || {
    correct: 0,
    incorrect: 0,
    unsure: 0
  };

  const confidence = contribution?.data?.confidenceScore || 0;
  const label = contribution?.data?.finalLabel || "pending";

  // ✅ color badge
  const confidenceColor =
    confidence >= 0.7
      ? "text-green-600"
      : confidence <= 0.3
        ? "text-red-600"
        : "text-yellow-600";

  return (
    <div className="space-y-6">

      {loading && <p>Loading...</p>}

      {!loading && message && (
        <p className="text-sm">{message}</p>
      )}

      {!loading && contribution && (
        <>
          <div className="p-4 border rounded-lg">
            {renderContribution()}

            {/* ✅ SCORE DISPLAY */}
            <div className="mt-4 p-3 bg-gray-50 border rounded text-sm">
              <p>
                ✅ {stats.correct} | ❌ {stats.incorrect} | 🤔 {stats.unsure}
              </p>

              <p className={confidenceColor}>
                Confidence: {(confidence * 100).toFixed(1)}%
              </p>

              <p>Status: {label}</p>
            </div>
          </div>

          {/* ✅ VOTING */}
          <div className="grid grid-cols-3 gap-3">
            <button disabled={voted} onClick={() => handleVote('correct')}>
              👍 Correct
            </button>

            <button disabled={voted} onClick={() => handleVote('incorrect')}>
              👎 Incorrect
            </button>

            <button disabled={voted} onClick={() => handleVote('unsure')}>
              🤔 Unsure
            </button>
          </div>
        </>
      )}
    </div>
  );
};


const StyledSelect = ({ id, label, value, onChange, children }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-semibold text-gray-700 uppercase tracking-wider">
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="w-full p-3.5 border border-slate-300 rounded-xl shadow-xs focus:ring-4 focus:ring-blue-100 focus:border-blue-500 hover:border-slate-400 transition-all duration-200 bg-white text-slate-800 font-medium"
    >
      {children}
    </select>
  </div>
);

const ProfileForm = ({ profileDocRef }) => {
  const [ageRange, setAgeRange] = useState('');
  const [gender, setGender] = useState('');
  const [primaryRegion, setPrimaryRegion] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!profileDocRef) return;

    const loadProfile = async () => {
      try {
        const docSnap = await getDoc(profileDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAgeRange(data.ageRange || '');
          setGender(data.gender || '');
          setPrimaryRegion(data.primaryRegion || '');
        }
      } catch (err) {
        console.error("Retrieving profile details failed:", err);
        setStatus('error');
        setMessage('Error retrieving active demographic settings.');
        setTimeout(() => setStatus('idle'), 3000);
      }
    };
    loadProfile();
  }, [profileDocRef]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      await setDoc(profileDocRef, {
        ageRange,
        gender,
        primaryRegion
      }, { merge: true });

      setStatus('success');
      setMessage('Demographic metadata locked in. Appreciated!');
      setTimeout(() => setStatus('idle'), 3000);

    } catch (err) {
      console.error("Failed to commit profiles:", err);
      setStatus('error');
      setMessage('Profile sync failure. Please review network constraints.');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <User className="w-6 h-6 text-blue-600" />
          Demographic Framework
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Supplying demographic variables is strictly optional. However, metadata variables significantly reduce biases during machine translation modeling.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <StyledSelect id="age-range" label="Age Range" value={ageRange} onChange={(e) => setAgeRange(e.target.value)}>
          <option value="">Choose to disclose or skip...</option>
          <option value="under_18">Under 18 Years</option>
          <option value="18-29">18 to 29 Years</option>
          <option value="30-49">30 to 49 Years</option>
          <option value="50-69">50 to 69 Years</option>
          <option value="70+">70+ Years</option>
        </StyledSelect>

        <StyledSelect id="gender" label="Gender Expression" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">Choose to disclose or skip...</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other / Self-Describe</option>
        </StyledSelect>

        <StyledSelect id="region" label="Socio-linguistic Region" value={primaryRegion} onChange={(e) => setPrimaryRegion(e.target.value)}>
          <option value="">Choose to disclose or skip...</option>
          <option value="hunza">Hunza Valley</option>
          <option value="nagar">Nagar Valley</option>
          <option value="other">Other Outlying Region</option>
        </StyledSelect>

        <StatusMessage status={status} message={message} />

        <SubmitButton status={status} icon={Save}>
          Lock In Profile Data
        </SubmitButton>
      </form>
    </div>
  );
};

// --- Updated App Orchestration Level ---
export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [contributionCount, setContributionCount] = useState(0);
  const [profileDocRef, setProfileDocRef] = useState(null);
  const [handshakeError, setHandshakeError] = useState(null);
  const [isQuotaMet, setIsQuotaMet] = useState(false);

  const [benchmarkCatalog, setBenchmarkCatalog] = useState(FALLBACK_BENCHMARKS);

  // Initialize Firebase clients once (avoid setState inside effects)
  const firebaseApp = useMemo(() => {
    try {
      return !getApps().length ? initializeApp(firebaseConfig) : getApp();
    } catch {
      return null;
    }
  }, []);

  const auth = useMemo(() => (firebaseApp ? getAuth(firebaseApp) : null), [firebaseApp]);
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), [firebaseApp]);
  const storage = useMemo(() => (firebaseApp ? getStorage(firebaseApp) : null), [firebaseApp]);

  useEffect(() => {
    let unsubProfile = () => { };
    let unsubAuth = () => { };

    if (!firebaseApp) return;

    const init = async () => {
      try {
        const authInstance = getAuth(firebaseApp);
        const dbInstance = getFirestore(firebaseApp);
        getStorage(firebaseApp);

        // 1. Check Global Daily Quota immediately
        const today = new Date().toISOString().split('T')[0];
        try {
          const statsRef = doc(dbInstance, `artifacts/${appId}/system`, 'daily_stats');
          const statsSnap = await getDoc(statsRef);
          if (statsSnap.exists() && statsSnap.data().date === today && statsSnap.data().writes >= DAILY_WRITE_LIMIT) {
            setIsQuotaMet(true);
          }
        } catch (err) { console.debug('quota check failed', err); }

        unsubAuth = onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
            const userProfileDocRef = doc(dbInstance, `artifacts/${appId}/users/${user.uid}/profile`, 'user_data');
            setProfileDocRef(userProfileDocRef);
            unsubProfile = onSnapshot(userProfileDocRef, (docSnap) => {
              setContributionCount(docSnap.exists() ? docSnap.data().count || 0 : 0);
            });
            setIsAuthReady(true);
          } else {
            try { await signInAnonymously(authInstance); }
            catch (authError) { setHandshakeError(authError.message); setIsAuthReady(true); }
          }
        });
      } catch (err) {
        setHandshakeError(err.message);
        setIsAuthReady(true);
      }
    };

    init();

    return () => { try { unsubAuth(); } catch (cleanupErr) { console.debug('cleanup auth error', cleanupErr); }; try { unsubProfile(); } catch (cleanupErr) { console.debug('cleanup profile error', cleanupErr); } };
  }, [firebaseApp]);

  // Phase 2: Cached Dynamic Catalog Extraction (SAVES 50,000 reads!)
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const fetchBenchmarkSentences = async () => {
      try {
        // Check Local Storage Cache first!
        const cacheKey = `benchmarks_${appId}`;
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);

        // Use cache if it's less than 24 hours old (86400000 ms)
        if (cachedData && cacheTime && (Date.now() - parseInt(cacheTime) < 86400000)) {
          setBenchmarkCatalog(JSON.parse(cachedData));
          return;
        }

        const benchRef = collection(db, `artifacts/${appId}/public/data/benchmark_sentences`);
        const benchSnap = await getDocs(benchRef);

        if (!benchSnap.empty) {
          const floresList = []; const tatoebaList = [];
          benchSnap.docs.forEach(docObj => {
            const data = docObj.data();
            const item = { id: data.sentenceId || docObj.id, text: data.text };
            if (data.source === 'flores') floresList.push(item);
            else if (data.source === 'tatoeba') tatoebaList.push(item);
          });

          const newCatalog = {
            flores: floresList.length > 0 ? floresList : FALLBACK_BENCHMARKS.flores,
            tatoeba: tatoebaList.length > 0 ? tatoebaList : FALLBACK_BENCHMARKS.tatoeba
          };

          setBenchmarkCatalog(newCatalog);

          // Save to Local Browser Cache to stop future Firestore reads
          localStorage.setItem(cacheKey, JSON.stringify(newCatalog));
          localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
        }
      } catch { console.warn("Using built-in presets."); }
    };
    fetchBenchmarkSentences();
  }, [isAuthReady, db, userId]);

  if (handshakeError) return <ConnectionDiagnosticScreen errorMsg={handshakeError} />;
  if (isQuotaMet) return <QuotaReachedScreen />;
  if (!isAuthReady || !db || !auth || !storage || !userId || !profileDocRef) return <GlobalLoader />;

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          0% { transform: scale(0.92); opacity: 0; }
          70% { transform: scale(1.02); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ripple {
          0% { transform: scale(0.95); opacity: 0.85; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes counterBump {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-popIn {
          animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-ripple {
          animation: ripple 1.6s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
        }
        .animate-counterBump {
          animation: counterBump 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      <div className="min-h-screen w-full bg-slate-50/50 text-slate-900 font-sans antialiased">

        {/* Responsive Header banner */}
        <header className="bg-white border-b border-slate-200/80 px-4 py-8 text-center space-y-4 shadow-xs">
          <div className="max-w-3xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-xs font-semibold text-blue-700 uppercase tracking-wider animate-fadeIn">
              <Info className="w-3.5 h-3.5" /> NLP Translation Research Engine
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight transition-all duration-300">
              Burushaski Language Hub
            </h1>
            <p className="text-base sm:text-lg text-slate-500 max-w-lg mx-auto leading-relaxed">
              Help preserve and index dialects from the Hunza & Nagar Valleys for translation model training.
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <ContributionCounter count={contributionCount} />
          </div>
        </header>

        {/* Action Center Layout */}
        <main className="max-w-2xl w-full mx-auto px-4 py-8 pb-16">

          {/* Tabs Nav bar */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-slate-200 mb-6 gap-2">
            <TabButton
              onClick={() => setActiveTab('text')}
              isActive={activeTab === 'text'}
            >
              <Type className="w-4.5 h-4.5" />
              <span>Text Entry</span>
            </TabButton>
            <TabButton
              onClick={() => setActiveTab('audio')}
              isActive={activeTab === 'audio'}
            >
              <Mic className="w-4.5 h-4.5" />
              <span>Audio Entry</span>
            </TabButton>
            <TabButton
              onClick={() => setActiveTab('validate')}
              isActive={activeTab === 'validate'}
            >
              <CheckSquare className="w-4.5 h-4.5" />
              <span>Verify Records</span>
            </TabButton>
            <TabButton
              onClick={() => setActiveTab('profile')}
              isActive={activeTab === 'profile'}
            >
              <User className="w-4.5 h-4.5" />
              <span>About You</span>
            </TabButton>
          </div>

          {/* Core App Viewport */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200/80 transition-all duration-300">
            {activeTab === 'text' && (
              <TextCollectionForm
                key="text"
                db={db}
                userId={userId}
                profileDocRef={profileDocRef}
                activeBenchmarkData={benchmarkCatalog}
              />
            )}
            {activeTab === 'audio' && (
              <AudioCollectionForm
                key="audio"
                db={db}
                storage={storage}
                userId={userId}
                profileDocRef={profileDocRef}
                activeBenchmarkData={benchmarkCatalog}
              />
            )}
            {activeTab === 'validate' && (
              <ValidationForm
                key="validate"
                db={db}
                storage={storage}
                userId={userId}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileForm
                key="profile"
                profileDocRef={profileDocRef}
              />
            )}
          </div>
        </main>

        {/* Page Footer element */}
        <footer className="text-center py-8 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-400 font-medium">
            Burushaski-to-English Translation ML Dataset Hub • Secure Open-Source Project • © {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </>
  );
}