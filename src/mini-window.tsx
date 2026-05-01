import ReactDOM from "react-dom/client";
import { MiniShell } from "@/components/mini-window/MiniShell";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<MiniShell />);
