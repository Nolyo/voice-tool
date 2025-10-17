# Voice Tool - Spécification de Migration vers Tauri

## 📋 Contexte et Motivation

### Problèmes de la Stack Actuelle (Python)

**Technologies problématiques:**
- **Tkinter**: Interface vieillotte, difficile à styliser, bugs de threading
- **pynput**: Gestion basique des hotkeys, instable
- **sounddevice**: API bas niveau, crashs PortAudio fréquents (surtout à la réouverture de fenêtres)
- **pystray**: Limité, maintenu sporadiquement
- **Threading Python**: Complexité excessive (Tk vs pystray vs audio), races conditions
- **PyInstaller**: Exe lourd (80-150 MB), startup lent (2-4s), pas de hot-reload en dev

**Problèmes architecturaux:**
- Code monolithique (main.py > 1500 lignes)
- Couplage fort entre UI et logique métier
- Gestion manuelle du multi-threading fragile
- Crashes PortAudio lors manipulation des fenêtres Tkinter
- Pas de hot-reload en développement

**Problèmes de transcription:**
- OpenAI Whisper API lent (2-4s pour 10s d'audio)
- Pas de streaming temps réel (impossible de voir le texte défiler pendant qu'on parle)
- Coût récurrent ($0.006/min)
- Dépendance réseau obligatoire

### Objectifs de la Migration

✅ **UI moderne et professionnelle** - React + Tailwind + shadcn/ui
✅ **Performance** - Exe léger (5-50 MB), startup instantané (<1s)
✅ **Transcription rapide** - Whisper local (0.5-1s) + option streaming temps réel
✅ **Architecture propre** - Séparation frontend/backend, code maintenable
✅ **DX améliorée** - Hot-reload, DevTools, TypeScript
✅ **Distribution simple** - .exe standalone + .msi installer

---

## 🎯 Stack Technique Cible

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite (hot-reload ultra-rapide)
- **UI**: Tailwind CSS + shadcn/ui (composants modernes)
- **State**: Zustand (gestion d'état simple)
- **Icons**: Lucide React
- **Animations**: Framer Motion (optionnel)

### Backend
- **Runtime**: Tauri 2.x (Rust)
- **Audio Capture**: cpal (cross-platform audio library)
- **Hotkeys**: global-hotkey (gestion native)
- **System Tray**: tauri-plugin-system-tray
- **HTTP Client**: reqwest (pour appels API)

### Transcription (Architecture Hybride)
- **Mode 1 (Défaut)**: API Streaming (Deepgram) - Temps réel, aucun téléchargement
- **Mode 2 (Optionnel)**: Whisper.cpp local - Rapide, gratuit, offline
- **Mode 3 **: Whisper API (optionnel, legacy)

---

## 🎤 Architecture de Transcription (Cœur du Système)

### Principe de Fonctionnement

**Par défaut (Premier lancement):**
1. L'exe embarque uniquement le binaire `whisper.cpp` (3 MB) - AUCUN modèle IA
2. Mode actif: **Deepgram Streaming API**
3. Aucun téléchargement requis, fonctionne immédiatement

**Activation du mode local (à la demande):**
1. L'utilisateur va dans Settings → Transcription
2. Sélectionne "Mode Local (Offline)"
3. Choix du modèle: Tiny (39 MB) / Base (74 MB) / Small (244 MB)
4. Clic sur "Télécharger" → Progress bar
5. Modèle stocké dans `%APPDATA%\VoiceTool\models\`
6. Bascule automatique vers whisper.cpp local

**Bascule entre modes:**
- Switch dans l'UI (Settings)
- Passage immédiat d'un mode à l'autre
- Préférence sauvegardée dans `user_settings.json`

### Comparaison des Modes

| Critère | Deepgram Streaming (Défaut) | Whisper.cpp Local (Optionnel) |
|---------|----------------------------|-------------------------------|
| **Téléchargement initial** | Aucun | 39-244 MB (modèle IA) |
| **Vitesse** | Temps réel (streaming) | 0.5-1s après enregistrement |
| **Latence** | 100-300ms | N/A (post-traitement) |
| **Streaming live** | ✅ Oui (texte défile pendant l'enregistrement) | ❌ Non (traitement après) |
| **Qualité** | ⭐⭐⭐⭐⭐ Excellente | ⭐⭐⭐⭐(tiny) à ⭐⭐⭐⭐⭐(small) |
| **Coût** | $0.0043/min (~5€/mois usage normal) | GRATUIT |
| **Offline** | ❌ Nécessite internet | ✅ Fonctionne offline |
| **Langues** | 30+ langues | 90+ langues |
| **Privacy** | Audio envoyé au cloud | 100% local |

### Configuration Technique

#### Deepgram Streaming (Mode Défaut)

**Fonctionnement:**
1. Connexion WebSocket vers `wss://api.deepgram.com/v1/listen`
2. Envoi de chunks audio en temps réel (pendant l'enregistrement)
3. Réception de transcriptions partielles (`interim_results`) + finales
4. Affichage live dans l'UI

**Implémentation Rust:**
```rust
// src-tauri/src/transcription/deepgram.rs

use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures_util::{SinkExt, StreamExt};

pub struct DeepgramStreaming {
    websocket: WebSocketStream,
    api_key: String,
}

impl DeepgramStreaming {
    pub async fn connect(&mut self) -> Result<()> {
        let url = format!(
            "wss://api.deepgram.com/v1/listen?language=fr&punctuate=true&interim_results=true",
        );

        let (ws_stream, _) = connect_async(&url).await?;
        self.websocket = ws_stream;

        // Auth header
        self.websocket.send(Message::Text(
            format!("Authorization: Token {}", self.api_key)
        )).await?;

        Ok(())
    }

    pub async fn send_audio(&mut self, audio_chunk: Vec<i16>) -> Result<()> {
        // Convertir en bytes
        let bytes: Vec<u8> = audio_chunk.iter()
            .flat_map(|s| s.to_le_bytes())
            .collect();

        self.websocket.send(Message::Binary(bytes)).await?;
        Ok(())
    }

    pub async fn receive_transcription(&mut self) -> Result<TranscriptResult> {
        if let Some(msg) = self.websocket.next().await {
            let data = msg?;
            let json: DeepgramResponse = serde_json::from_str(&data.to_string())?;

            Ok(TranscriptResult {
                text: json.channel.alternatives[0].transcript.clone(),
                is_final: json.is_final,
            })
        } else {
            Err(anyhow!("Connection closed"))
        }
    }
}
```

**Tauri Command (exposé au frontend):**
```rust
#[tauri::command]
async fn start_streaming_transcription(
    state: State<'_, AppState>,
    language: String,
) -> Result<(), String> {
    let mut deepgram = state.deepgram.lock().await;
    deepgram.connect().await.map_err(|e| e.to_string())?;

    // Spawner un thread pour recevoir les transcriptions
    tokio::spawn(async move {
        loop {
            match deepgram.receive_transcription().await {
                Ok(result) => {
                    // Émettre vers le frontend
                    if result.is_final {
                        emit_event("transcription-final", result.text);
                    } else {
                        emit_event("transcription-interim", result.text);
                    }
                }
                Err(e) => {
                    eprintln!("Streaming error: {}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn send_audio_chunk(
    state: State<'_, AppState>,
    chunk: Vec<i16>,
) -> Result<(), String> {
    let deepgram = state.deepgram.lock().await;
    deepgram.send_audio(chunk).await.map_err(|e| e.to_string())
}
```

#### Whisper.cpp Local (Mode Optionnel)

**Fonctionnement:**
1. Modèle IA téléchargé une seule fois (stocké dans AppData)
2. Transcription locale après arrêt de l'enregistrement
3. Traitement ultra-rapide (0.5-1s)
4. Zero dépendance réseau

**Implémentation Rust:**
```rust
// src-tauri/src/transcription/whisper.rs

use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};
use std::path::PathBuf;

pub struct WhisperLocal {
    context: Option<WhisperContext>,
    model_path: PathBuf,
}

impl WhisperLocal {
    pub fn new(model_path: PathBuf) -> Result<Self> {
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().unwrap(),
            WhisperContextParameters::default()
        )?;

        Ok(Self {
            context: Some(ctx),
            model_path,
        })
    }

    pub fn transcribe(&mut self, audio_data: &[f32], language: &str) -> Result<String> {
        let ctx = self.context.as_ref().ok_or(anyhow!("Context not loaded"))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(language)); // "fr", "en", etc.
        params.set_translate(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Transcription
        ctx.full(params, audio_data)?;

        // Récupérer le texte
        let num_segments = ctx.full_n_segments()?;
        let mut full_text = String::new();

        for i in 0..num_segments {
            let segment = ctx.full_get_segment_text(i)?;
            full_text.push_str(&segment);
        }

        Ok(full_text.trim().to_string())
    }
}
```

**Tauri Commands:**
```rust
#[tauri::command]
async fn download_whisper_model(
    app: AppHandle,
    model_size: String, // "tiny", "base", "small"
) -> Result<(), String> {
    let app_data = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data dir")?;

    let models_dir = app_data.join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let model_filename = format!("ggml-{}.bin", model_size);
    let model_path = models_dir.join(&model_filename);

    // Si déjà téléchargé, skip
    if model_path.exists() {
        return Ok(());
    }

    // URL HuggingFace
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model_filename
    );

    // Téléchargement avec progress
    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&model_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;

        downloaded += chunk.len() as u64;
        let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;

        // Émettre progress vers frontend
        app.emit_all("download-progress", progress).ok();
    }

    Ok(())
}

#[tauri::command]
async fn transcribe_with_whisper(
    state: State<'_, AppState>,
    audio_data: Vec<f32>,
    language: String,
) -> Result<String, String> {
    let mut whisper = state.whisper.lock().await;
    whisper.transcribe(&audio_data, &language).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_model_downloaded(app: AppHandle, model_size: String) -> Result<bool, String> {
    let app_data = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data dir")?;

    let model_path = app_data.join("models").join(format!("ggml-{}.bin", model_size));
    Ok(model_path.exists())
}
```

### Frontend React - Gestion des Modes

**Settings UI:**
```tsx
// src/components/TranscriptionSettings.tsx

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type TranscriptionMode = 'streaming' | 'local';
type ModelSize = 'tiny' | 'base' | 'small';

export function TranscriptionSettings() {
  const [mode, setMode] = useState<TranscriptionMode>('streaming');
  const [modelSize, setModelSize] = useState<ModelSize>('base');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [modelsDownloaded, setModelsDownloaded] = useState<Record<ModelSize, boolean>>({
    tiny: false,
    base: false,
    small: false,
  });

  // Vérifier les modèles téléchargés au chargement
  useEffect(() => {
    checkDownloadedModels();
  }, []);

  // Écouter le progress de téléchargement
  useEffect(() => {
    const unlisten = listen('download-progress', (event) => {
      setDownloadProgress(event.payload as number);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkDownloadedModels = async () => {
    const tiny = await invoke<boolean>('check_model_downloaded', { modelSize: 'tiny' });
    const base = await invoke<boolean>('check_model_downloaded', { modelSize: 'base' });
    const small = await invoke<boolean>('check_model_downloaded', { modelSize: 'small' });

    setModelsDownloaded({ tiny, base, small });
  };

  const handleDownloadModel = async (size: ModelSize) => {
    setDownloading(true);
    setDownloadProgress(0);

    try {
      await invoke('download_whisper_model', { modelSize: size });
      await checkDownloadedModels();
      // Basculer automatiquement vers le mode local
      setMode('local');
      setModelSize(size);
      await saveSettings({ mode: 'local', modelSize: size });
    } catch (error) {
      console.error('Download failed:', error);
      alert('Échec du téléchargement. Vérifiez votre connexion.');
    } finally {
      setDownloading(false);
    }
  };

  const handleModeChange = async (newMode: TranscriptionMode) => {
    // Si on bascule vers local mais aucun modèle n'est téléchargé
    if (newMode === 'local' && !Object.values(modelsDownloaded).some(v => v)) {
      alert('Veuillez d\'abord télécharger un modèle IA.');
      return;
    }

    setMode(newMode);
    await saveSettings({ mode: newMode, modelSize });
  };

  const saveSettings = async (settings: { mode: TranscriptionMode; modelSize: ModelSize }) => {
    await invoke('save_transcription_settings', settings);
  };

  const modelInfo = {
    tiny: { size: '39 MB', quality: 'Correcte', speed: 'Très rapide (0.3s)' },
    base: { size: '74 MB', quality: 'Bonne', speed: 'Rapide (0.5s)' },
    small: { size: '244 MB', quality: 'Excellente', speed: 'Modérée (1s)' },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcription</CardTitle>
        <CardDescription>
          Choisissez entre la transcription en streaming (temps réel) ou locale (offline)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Sélection du mode */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Mode de transcription</Label>
          <RadioGroup value={mode} onValueChange={handleModeChange}>
            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent">
              <RadioGroupItem value="streaming" id="streaming" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="streaming" className="font-medium cursor-pointer">
                  Streaming en temps réel (Deepgram)
                  <Badge variant="default" className="ml-2">Recommandé</Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  ✅ Texte qui défile pendant l'enregistrement<br/>
                  ✅ Qualité excellente<br/>
                  ✅ Aucun téléchargement requis<br/>
                  ⚠️ Nécessite internet (~$0.004/min)
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent">
              <RadioGroupItem value="local" id="local" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="local" className="font-medium cursor-pointer">
                  Local offline (Whisper.cpp)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  ✅ 100% gratuit et privé<br/>
                  ✅ Fonctionne offline<br/>
                  ✅ Ultra-rapide (0.3-1s)<br/>
                  ⚠️ Requiert téléchargement modèle IA (39-244 MB)
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Configuration mode local */}
        {mode === 'local' && (
          <div className="space-y-3 pl-6 border-l-2 border-primary">
            <Label className="text-sm font-semibold">Modèle IA (qualité vs vitesse)</Label>

            {(['tiny', 'base', 'small'] as ModelSize[]).map((size) => (
              <div key={size} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{size}</span>
                    {modelsDownloaded[size] && (
                      <Badge variant="success">Téléchargé</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {modelInfo[size].size} • Qualité: {modelInfo[size].quality} • Vitesse: {modelInfo[size].speed}
                  </p>
                </div>

                {!modelsDownloaded[size] ? (
                  <Button
                    size="sm"
                    onClick={() => handleDownloadModel(size)}
                    disabled={downloading}
                  >
                    Télécharger
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={modelSize === size ? 'default' : 'outline'}
                    onClick={() => {
                      setModelSize(size);
                      saveSettings({ mode, modelSize: size });
                    }}
                  >
                    {modelSize === size ? 'Actif' : 'Utiliser'}
                  </Button>
                )}
              </div>
            ))}

            {downloading && (
              <div className="space-y-2 p-3 bg-accent rounded-lg">
                <p className="text-sm font-medium">Téléchargement en cours...</p>
                <Progress value={downloadProgress} className="w-full" />
                <p className="text-xs text-muted-foreground">{downloadProgress}%</p>
              </div>
            )}
          </div>
        )}

        {/* Info carte API */}
        {mode === 'streaming' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              💡 <strong>API Deepgram</strong>: 45 heures gratuites/mois incluses.
              Configuration dans Settings → API Keys.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Store Zustand (gestion d'état):**
```tsx
// src/store/transcriptionStore.ts

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';

type TranscriptionMode = 'streaming' | 'local';

interface TranscriptionState {
  mode: TranscriptionMode;
  isRecording: boolean;
  interimText: string;
  finalText: string;

  setMode: (mode: TranscriptionMode) => void;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  setInterimText: (text: string) => void;
  setFinalText: (text: string) => void;
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  mode: 'streaming',
  isRecording: false,
  interimText: '',
  finalText: '',

  setMode: (mode) => set({ mode }),

  startRecording: async () => {
    const { mode } = get();
    set({ isRecording: true, interimText: '', finalText: '' });

    if (mode === 'streaming') {
      await invoke('start_streaming_transcription', { language: 'fr' });
    } else {
      await invoke('start_local_recording');
    }
  },

  stopRecording: async () => {
    const { mode } = get();
    set({ isRecording: false });

    if (mode === 'streaming') {
      await invoke('stop_streaming_transcription');
    } else {
      // Mode local: traitement post-enregistrement
      await invoke('stop_local_recording');
    }
  },

  setInterimText: (text) => set({ interimText: text }),
  setFinalText: (text) => set({ finalText: text, interimText: '' }),
}));
```

**Visualiseur avec texte live:**
```tsx
// src/components/TranscriptionVisualizer.tsx

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranscriptionStore } from '@/store/transcriptionStore';
import { motion, AnimatePresence } from 'framer-motion';

export function TranscriptionVisualizer() {
  const { mode, interimText, finalText, setInterimText, setFinalText } = useTranscriptionStore();

  useEffect(() => {
    // Écouter les events de transcription
    const unlistenInterim = listen('transcription-interim', (event) => {
      setInterimText(event.payload as string);
    });

    const unlistenFinal = listen('transcription-final', (event) => {
      setFinalText(event.payload as string);
    });

    return () => {
      unlistenInterim.then(fn => fn());
      unlistenFinal.then(fn => fn());
    };
  }, []);

  return (
    <div className="p-6 space-y-4 min-h-[200px]">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium">
          {mode === 'streaming' ? 'Streaming en temps réel' : 'Enregistrement local'}
        </span>
      </div>

      <div className="space-y-2">
        {/* Texte interim (streaming uniquement, grisé) */}
        <AnimatePresence>
          {mode === 'streaming' && interimText && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-lg text-gray-400 italic"
            >
              {interimText}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Texte final */}
        <AnimatePresence>
          {finalText && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-medium text-white"
            >
              {finalText}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Placeholder si rien */}
        {!interimText && !finalText && (
          <p className="text-gray-500 text-center py-8">
            Commencez à parler...
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## 📦 Structure de Distribution

### Exe Final

**Contenu embarqué dans l'exe (5-8 MB):**
```
voice-tool.exe
├── Frontend React compilé (app.asar, ~2 MB)
├── Runtime Tauri (Rust, ~2 MB)
├── whisper.cpp binaire (libwhisper.dll, ~3 MB)
└── Pas de modèle IA embarqué
```

**Stockage utilisateur (%APPDATA%\VoiceTool\):**
```
%APPDATA%\VoiceTool\
├── models/                     # Modèles IA (téléchargés à la demande)
│   ├── ggml-tiny.bin          # 39 MB (optionnel)
│   ├── ggml-base.bin          # 74 MB (optionnel)
│   └── ggml-small.bin         # 244 MB (optionnel)
├── recordings/                 # Audios enregistrés
├── user_settings.json          # Config utilisateur
├── history.json                # Historique des transcriptions
└── voice_tool.log              # Logs
```

### Formats de Distribution

1. **voice-tool.exe** - Portable standalone (~8 MB)
2. **voice-tool.msi** - Installeur Windows avec:
   - Intégration menu Démarrer
   - Option "Démarrer avec Windows"
   - Désinstallation propre

---

## 🗺️ Plan de Migration Détaillé

### Phase 0: Préparation (1 jour)

**Objectif**: Setup environnement de développement Tauri

**Tasks:**
1. Installer Rust + Tauri CLI
   ```bash
   # Windows
   winget install Rustlang.Rustup
   cargo install tauri-cli
   ```

2. Créer le projet
   ```bash
   npm create tauri-app@latest voice-tool-v2
   # Choisir: React + TypeScript
   cd voice-tool-v2
   ```

3. Installer dépendances UI modernes
   ```bash
   npm install @radix-ui/react-* class-variance-authority clsx tailwind-merge
   npm install zustand lucide-react framer-motion
   npx shadcn-ui@latest init
   ```

4. Configurer Tailwind CSS
   ```bash
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

5. Setup Rust dependencies dans `src-tauri/Cargo.toml`
   ```toml
   [dependencies]
   tauri = { version = "2.0", features = ["..." ] }
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   tokio = { version = "1", features = ["full"] }
   anyhow = "1"

   # Audio
   cpal = "0.15"

   # Transcription
   whisper-rs = "0.12"  # Bindings whisper.cpp
   reqwest = { version = "0.11", features = ["stream"] }
   tokio-tungstenite = "0.21"  # WebSocket pour Deepgram

   # Hotkeys
   global-hotkey = "0.5"
   ```

**Livrable**: Projet Tauri vierge fonctionnel avec hot-reload

---

### Phase 1: Audio Capture (2-3 jours)

**Objectif**: Capture audio fonctionnelle avec visualisation

**Tasks:**

1. **Backend Rust - Capture audio**
   - Implémenter `src-tauri/src/audio.rs`
   - Utiliser `cpal` pour capturer depuis le micro
   - Buffer audio en mémoire (format WAV, 16kHz mono)
   - Exposer Tauri commands: `start_recording()`, `stop_recording()`, `get_audio_devices()`

2. **Backend Rust - Visualisation temps réel**
   - Calculer RMS des chunks audio
   - Émettre events `audio-level` vers le frontend (30 FPS)

3. **Frontend React - Visualiseur**
   - Composant `AudioVisualizer.tsx` avec canvas
   - Animation fluide des niveaux audio
   - Indicateur d'enregistrement (pulsation rouge)

4. **Frontend React - Contrôles**
   - Bouton micro (toggle on/off)
   - Sélecteur de device audio (dropdown)
   - Store Zustand pour l'état d'enregistrement

**Code exemple - Audio capture Rust:**
```rust
// src-tauri/src/audio.rs

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

pub struct AudioRecorder {
    buffer: Arc<Mutex<Vec<i16>>>,
    stream: Option<cpal::Stream>,
    sample_rate: u32,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            sample_rate: 16000,
        }
    }

    pub fn start_recording(&mut self, device_index: Option<usize>) -> Result<()> {
        let host = cpal::default_host();
        let device = if let Some(idx) = device_index {
            host.input_devices()?.nth(idx).ok_or(anyhow!("Invalid device"))?
        } else {
            host.default_input_device().ok_or(anyhow!("No input device"))?
        };

        let config = device.default_input_config()?;
        let buffer = self.buffer.clone();

        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                let mut buf = buffer.lock().unwrap();
                buf.extend_from_slice(data);

                // Calculer RMS pour visualisation
                let rms = calculate_rms(data);
                // Émettre via channel (à implémenter)
                emit_audio_level(rms);
            },
            |err| eprintln!("Audio stream error: {}", err),
            None,
        )?;

        stream.play()?;
        self.stream = Some(stream);
        Ok(())
    }

    pub fn stop_recording(&mut self) -> Result<Vec<i16>> {
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }

        let mut buffer = self.buffer.lock().unwrap();
        let audio_data = buffer.drain(..).collect();
        Ok(audio_data)
    }
}

fn calculate_rms(samples: &[i16]) -> f32 {
    let sum: f64 = samples.iter()
        .map(|&s| (s as f64 / 32768.0).powi(2))
        .sum();
    (sum / samples.len() as f64).sqrt() as f32
}
```

**Livrable**: Application avec bouton micro fonctionnel + visualisation audio

---

### Phase 2: Transcription Streaming (3-4 jours)

**Objectif**: Mode Deepgram streaming opérationnel

**Tasks:**

1. **Backend Rust - Deepgram WebSocket**
   - Implémenter `src-tauri/src/transcription/deepgram.rs`
   - Connexion WebSocket authentifiée
   - Envoi chunks audio en temps réel
   - Réception transcriptions (interim + final)
   - Gestion erreurs/reconnexion

2. **Backend Rust - Tauri Commands**
   - `start_streaming_transcription(language: String)`
   - `send_audio_chunk(chunk: Vec<i16>)`
   - `stop_streaming_transcription()`
   - Events: `transcription-interim`, `transcription-final`

3. **Frontend React - UI transcription live**
   - Composant `TranscriptionVisualizer.tsx`
   - Affichage texte interim (grisé, italic)
   - Affichage texte final (blanc, bold)
   - Animations d'apparition (Framer Motion)

4. **Frontend React - Settings API**
   - Input pour clé API Deepgram
   - Validation de la clé (test call)
   - Stockage sécurisé dans user_settings.json

5. **Tests**
   - Latence moyenne (<300ms)
   - Qualité transcription (français, anglais)
   - Robustesse (coupure réseau, reconnexion)

**Code exemple - Frontend React:**
```tsx
// src/hooks/useStreamingTranscription.ts

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export function useStreamingTranscription() {
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const unlistenInterim = listen('transcription-interim', (event) => {
      setInterimText(event.payload as string);
    });

    const unlistenFinal = listen('transcription-final', (event) => {
      setFinalText(prev => prev + ' ' + event.payload);
      setInterimText('');
    });

    return () => {
      unlistenInterim.then(fn => fn());
      unlistenFinal.then(fn => fn());
    };
  }, []);

  const startStreaming = async (language: string = 'fr') => {
    setFinalText('');
    setInterimText('');
    await invoke('start_streaming_transcription', { language });
    setIsStreaming(true);
  };

  const stopStreaming = async () => {
    await invoke('stop_streaming_transcription');
    setIsStreaming(false);
  };

  return {
    interimText,
    finalText,
    isStreaming,
    startStreaming,
    stopStreaming,
  };
}
```

**Livrable**: Mode streaming fonctionnel avec texte qui défile en temps réel

---

### Phase 3: Transcription Locale (3-4 jours)

**Objectif**: Mode whisper.cpp local opérationnel avec téléchargement de modèles

**Tasks:**

1. **Backend Rust - Whisper.cpp intégration**
   - Dépendance `whisper-rs` dans Cargo.toml
   - Implémenter `src-tauri/src/transcription/whisper.rs`
   - Chargement modèle depuis AppData
   - Transcription audio (post-enregistrement)

2. **Backend Rust - Téléchargement modèles**
   - Command `download_whisper_model(model_size: String)`
   - Stream depuis HuggingFace avec progress
   - Stockage dans `%APPDATA%\VoiceTool\models\`
   - Validation checksum (optionnel)

3. **Backend Rust - Tauri Commands**
   - `transcribe_with_whisper(audio: Vec<f32>, language: String)`
   - `check_model_downloaded(model_size: String) -> bool`
   - `get_downloaded_models() -> Vec<String>`

4. **Frontend React - Settings modèles**
   - UI de sélection modèle (tiny/base/small)
   - Boutons "Télécharger" avec progress bar
   - Bascule mode streaming ↔ local
   - Indication modèles téléchargés (badges)

5. **Frontend React - Post-transcription**
   - Après arrêt enregistrement → "Traitement..."
   - Appel `transcribe_with_whisper()`
   - Affichage résultat (animation d'apparition)

6. **Tests**
   - Vitesse transcription (objectif <1s pour 10s audio)
   - Qualité (comparaison avec Deepgram)
   - Consommation mémoire

**Code exemple - Téléchargement modèle:**
```rust
// src-tauri/src/transcription/model_downloader.rs

use reqwest::Client;
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

pub async fn download_model(
    model_size: &str,
    dest_path: PathBuf,
    progress_callback: impl Fn(u64, u64),
) -> Result<()> {
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
        model_size
    );

    let client = Client::new();
    let response = client.get(&url).send().await?;
    let total_size = response.content_length().unwrap_or(0);

    let mut file = File::create(dest_path)?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;
        progress_callback(downloaded, total_size);
    }

    Ok(())
}
```

**Livrable**: Mode local fonctionnel avec téléchargement de modèles

---

### Phase 4: Features Complémentaires (2-3 jours)

**Objectif**: Parité fonctionnelle avec app Python

**Tasks:**

1. **Hotkeys globaux**
   - Intégration `global-hotkey` (Rust)
   - Command `register_hotkey(keys: String, action: String)`
   - Actions: `toggle_recording`, `open_window`
   - UI de configuration (key binding input)

2. **System Tray**
   - Plugin `tauri-plugin-system-tray`
   - Icône + menu contextuel
   - Actions: Ouvrir, Settings, Quitter
   - Indicateur d'enregistrement (icône rouge)

3. **Historique**
   - Stockage JSON dans AppData
   - Composant `History.tsx` (liste déroulante)
   - Actions: Copier, Supprimer, Rejouer audio

4. **Clipboard auto-paste**
   - Copie automatique après transcription
   - Option "Coller au curseur" (simulation Ctrl+V)
   - Cross-platform (Windows/macOS/Linux)

5. **Paramètres persistants**
   - user_settings.json dans AppData
   - Migration depuis ancien format (si applicable)
   - Validation et defaults

**Livrable**: Application feature-complete

---

### Phase 5: Polish & Distribution (2 jours)

**Objectif**: Application production-ready

**Tasks:**

1. **UI/UX Polish**
   - Animations fluides (Framer Motion)
   - Dark mode (système ou manuel)
   - Responsive design
   - Error states et loading indicators

2. **Gestion d'erreurs**
   - Toasts notifications (shadcn/ui)
   - Fallbacks (mode streaming échoue → suggérer mode local)
   - Logs détaillés (fichier + console)

3. **Build & Packaging**
   - Optimisation bundle (tree-shaking)
   - Génération icônes (multi-résolutions)
   - Configuration tauri.conf.json (identifiers, permissions)
   - Build .exe + .msi

4. **CI/CD**
   - GitHub Actions pour build automatique
   - Release workflow (tags → artifacts)
   - Code signing (optionnel, certificat Windows)

5. **Documentation**
   - README.md complet
   - Guide d'installation
   - FAQ et troubleshooting

**Commandes de build:**
```bash
# Dev
npm run tauri dev

# Build production (local)
npm run tauri build

# Output dans src-tauri/target/release/bundle/
# - msi/voice-tool.msi
# - nsis/voice-tool-setup.exe
```

**Livrable**: Exe distributable + CI/CD opérationnel

---

## 📊 Estimations Totales

| Phase | Durée | Complexité |
|-------|-------|------------|
| Phase 0: Setup | 1 jour | Facile |
| Phase 1: Audio | 2-3 jours | Moyenne |
| Phase 2: Streaming | 3-4 jours | Difficile |
| Phase 3: Local | 3-4 jours | Moyenne |
| Phase 4: Features | 2-3 jours | Facile |
| Phase 5: Polish | 2 jours | Facile |
| **TOTAL** | **13-17 jours** | - |

**Estimation réaliste avec buffer**: **3-4 semaines**

---

## 🎯 Critères de Succès

### Fonctionnels
- ✅ Exe standalone <10 MB (sans modèles)
- ✅ Startup <1s
- ✅ Mode streaming avec latence <300ms
- ✅ Mode local avec transcription <1s (audio 10s)
- ✅ Bascule fluide entre modes
- ✅ Hotkeys globaux fonctionnels
- ✅ System tray opérationnel
- ✅ Historique persistant

### Techniques
- ✅ Architecture propre (séparation frontend/backend)
- ✅ Code TypeScript + Rust type-safe
- ✅ Tests unitaires critiques (audio, transcription)
- ✅ Logs structurés
- ✅ Gestion d'erreurs robuste

### Distribution
- ✅ Build automatisé (CI/CD)
- ✅ .msi installer professionnel
- ✅ Documentation complète

---

## 🔄 Comparaison Avant/Après

| Aspect | Avant (Python/Tkinter) | Après (Tauri/React) |
|--------|------------------------|---------------------|
| **Taille exe** | 80-150 MB | 5-50 MB |
| **Startup** | 2-4s | <1s |
| **UI** | Tkinter (vieillot) | React moderne |
| **Hot reload** | ❌ | ✅ |
| **Transcription** | API lente (2-4s) | Streaming (<300ms) ou local (<1s) |
| **Coût** | $0.006/min | $0.004/min ou gratuit |
| **Offline** | ❌ | ✅ (mode local) |
| **Crashes** | Fréquents (PortAudio) | Rares (Rust stable) |
| **Maintenabilité** | Difficile (1500+ lignes) | Facile (modularisé) |
| **CI/CD** | Basique | Complet (auto-release) |

---

## 📚 Ressources & Références

### Documentation
- [Tauri Docs](https://tauri.app/v2/)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [whisper-rs](https://github.com/tazz4843/whisper-rs)
- [Deepgram Streaming API](https://developers.deepgram.com/docs/streaming)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [cpal Audio Library](https://docs.rs/cpal/)

### Exemples de code
- [Tauri + React Template](https://github.com/tauri-apps/tauri/tree/dev/examples/api)
- [whisper-rs Examples](https://github.com/tazz4843/whisper-rs/tree/master/examples)

### APIs
- [Deepgram](https://deepgram.com/) - 45h gratuit/mois
- [HuggingFace Whisper Models](https://huggingface.co/ggerganov/whisper.cpp)

---

## ⚠️ Points d'Attention

### Dépendances
- **WebView2** (Windows): Pré-installé sur Win10/11 récent. Si absent, popup d'installation (100 MB, une fois).
- **Modèles Whisper**: Téléchargement uniquement si mode local activé.

### Performance
- **GPU**: whisper.cpp bénéficie du GPU (CUDA/Metal) pour 10x vitesse. Détecter automatiquement.
- **RAM**: Mode local consomme ~500 MB (modèle chargé en mémoire). Acceptable pour usage desktop.

### Sécurité
- **API Keys**: Stocker dans user_settings.json (plaintext local). Pour production avancée, utiliser OS keychain (optionnel).
- **Audio**: Jamais stocké permanent (sauf option "Garder enregistrements").

### Limitations
- **Streaming local**: whisper.cpp ne supporte pas nativement le streaming. Possible avec chunking mais qualité moindre.
- **Langues rares**: Deepgram supporte 30+ langues vs 90+ pour Whisper.

---

## 🚀 Next Steps (Après Migration)

### Améliorations Futures
1. **Auto-update intégré** (tauri-plugin-updater)
2. **Multi-langues UI** (i18n)
3. **Thèmes personnalisables**
4. **Export formats** (TXT, MD, JSON)
5. **Intégrations** (Notion, Obsidian, etc.)
6. **Mode dictée longue** (enregistrements >5min avec chunking)
7. **Commandes vocales** (meta-actions: "annuler", "nouveau paragraphe")

### Expansion Plateforme
- **macOS**: Build .dmg (déjà supporté par Tauri)
- **Linux**: Build .AppImage / .deb
- **Mobile** (futur): Tauri supporte iOS/Android (beta)

---

## 📞 Support & Questions

Pour toute question durant la migration:
1. Référer à cette spec
2. Consulter la doc Tauri/whisper-rs
3. Tester progressivement (une phase à la fois)
4. Logger abondamment (Rust: `tracing`, React: `console.log`)

**Bonne migration ! 🎉**
