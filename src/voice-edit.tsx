import ReactDOM from "react-dom/client";
import { VoiceEditOverlay } from "@/components/voice-edit/VoiceEditOverlay";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<VoiceEditOverlay />);
