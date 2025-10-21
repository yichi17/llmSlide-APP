const { mode } = require('crypto-js');
const { app, BrowserWindow, protocol, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { json } = require('stream/consumers');
const Store = require('electron-store').default;;
const store = new Store();
let llamaChat, modelChat, contextChat, modelSessionChat;
let llamaSlide, modelSlide, contextSlide, modelSessionSlide;
let modelPath;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
    }
  }
]);

app.whenReady().then(async () => {
  const llamaModule = await import("node-llama-cpp");
  const getLlama = llamaModule.getLlama;
  const LlamaChatSession = llamaModule.LlamaChatSession;
  llamaChat = await getLlama();
  llamaSlide = await getLlama();

  const preloadPath = app.isPackaged
  ? path.join(__dirname, "dist/js/preload.js")
  : path.join(__dirname, "public/js/preload.js");  

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });
  win.setMenuBarVisibility(false);

  if (app.isPackaged) {
    win.loadFile('dist/index.html');
  } else {
    win.loadURL('http://localhost:1450/');
    win.webContents.openDevTools()
  }

  win.on('close', (e) => {
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['取消', '確定'],
    title: '離開',
    message: '你確定要關閉應用程式嗎？'
    });
    if (choice) win.destroy();
  });

  ipcMain.handle("model-load", async (event, modelPathParam) => {
    await unloadModel();
    try {
      const promptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar/dist/helper/promptChat.txt')
        : path.join(__dirname, 'public/helper/promptChat.txt');
      let prompt = await fs.readFile(promptPath, "utf-8");

      modelPath = modelPathParam;
      modelChat = await llamaChat.loadModel({
        modelPath: modelPath,
      });
      contextChat = await modelChat.createContext();
      modelSessionChat = new LlamaChatSession({
        contextSequence: contextChat.getSequence(),
        systemPrompt: prompt
      });
      console.log("Model loaded successfully");
      return true;
    } catch (err) {
      console.error("Error loading model:", err);
      return false;
    }
  });

  ipcMain.handle("model-chat", async (event, userMessage) => {
      if (!modelSessionChat) {
        throw new Error("Model not loaded");
      }
      const assistantMessage = await modelSessionChat.prompt(userMessage);
      return assistantMessage;
    });

  ipcMain.handle("model-chat-stream", async (event, userMessage) => {
    if (!modelSessionChat) {
      throw new Error("Model not loaded");
    }
    let fullResponse = "";
    await modelSessionChat.promptWithMeta(userMessage, {
      onResponseChunk(chunk) {
        event.sender.send("model-chat-stream-chunk", chunk.text);
        fullResponse += chunk.text;
      }
    });
    event.sender.send("model-chat-stream-chunk", "[END]");
    return true;
  });

  ipcMain.handle("model-grenerate-slides", async (event, outline, language) => {
  console.log(modelPath);

  if (!modelSessionChat) {
    throw new Error("Model not loaded");
  }

  modelSlide = await llamaSlide.loadModel({
    modelPath: modelPath,
  });
  
  const promptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar/dist/helper/promptSlide2.txt')
    : path.join(__dirname, 'public/helper/promptSlide2.txt');
  let prompt = await fs.readFile(promptPath, "utf-8");
  prompt = prompt.replace("${language}", language);

  console.log(prompt);

  const contextSizes = [8192, 4096, 2048];
  for (const size of contextSizes) {
    try {
      const targetSize = Math.min(modelSlide.trainContextSize, size);
      console.log(`Attempting to create context with size: ${targetSize}`);
      
      contextSlide = await modelSlide.createContext({
        contextSize: targetSize,
      });
      
      console.log(`Successfully created context with size: ${targetSize}`);
      break;
    } catch (err) {
      console.error(`Failed to create context with size ${size}: ${err.message}`);
      if (size === contextSizes[contextSizes.length - 1]) {
        throw new Error(`Unable to create context even with smallest size (${size}). Insufficient memory.`);
      }
    }
  }
  modelSessionSlide = new LlamaChatSession({
    contextSequence: contextSlide.getSequence(),
    systemPrompt: prompt
  });

  console.log("Start generating slides...");

  const assistantMessage = await modelSessionChat.prompt(outline);

  const response = await modelSessionSlide.prompt(prompt + "\n大綱內容: " + assistantMessage, { 
    maxTokens: contextSlide.contextSize
  });

  console.log("Finished generating slides.");
  console.log(response);

  try {
    if (modelSessionSlide) {
      modelSessionSlide = null;
    }
    if (contextSlide) {
      await contextSlide.dispose();
      contextSlide = null;
    }
    if (modelSlide) {
      await modelSlide.dispose();
      modelSlide = null;
    }
  } catch (err) {
    console.error("Error unloading model:", err);
  }

  return response;

  });

  ipcMain.handle("model-unload", async () => {
    const result = await unloadModel();
    return result;
  });

  ipcMain.handle("get-pdf-text", async (event, filepath) => {
    if (process.platform === 'darwin') {
      text = await ocrHelperMacos(filepath);
    } else if (process.platform === 'win32') {
      text = await ocrHelperWindows(filepath);
    }
    if (text.status === "success") {
      return text.message.pdfOcrText?.length > text.message.pdfText?.length ? text.message.pdfOcrText : text.message.pdfText;
    }else{
      throw new Error(text.message);
    }
  });

  ipcMain.handle("show-model-list", async() => {
    const modelDir = app.isPackaged
    ? path.join(process.resourcesPath, "models/")
    : path.join(__dirname, "public/models/");
    return getFiles(modelDir);
  });

  ipcMain.handle("get-model-path", () => {
    const modelDir = app.isPackaged
    ? path.join(process.resourcesPath, "models/")
    : path.join(__dirname, "public/models/");
    return modelDir;
  });

  ipcMain.handle('open-folder', async (event, folderPath) => {
    if (process.platform === 'win32') {
      spawn('explorer.exe', [folderPath.replace('file://', '')]);
    }else{
      shell.openPath(folderPath.replace('file://', ''));
    }
  });

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'txt'] }
      ]
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
});

async function getFiles(dir, files = []) {
  try {
    const fileList = await fs.readdir(dir, { withFileTypes: true });
    for (const file of fileList) {
      const fullPath = path.join(dir, file.name);
    
      if (file.isDirectory()) {
        await getFiles(fullPath, files);
      } else {
        if (file.name.endsWith('.gguf')) files.push(fullPath);
      }
    }
    return files;
  } catch (error) {
    throw new Error(`Error reading directory ${dir}: ${error.message}`);
  }
}

async function unloadModel() {
  try {
      if (modelSessionChat) {
        modelSessionChat = null;
      }
      if (contextChat) {
        await contextChat.dispose();
        contextChat = null;
      }
      if (modelChat) {
        await modelChat.dispose();
        modelChat = null;
      }
      console.log("Model unloaded successfully");
      return true;
    } catch (err) {
      console.error("Error unloading model:", err);
      return false;
    }
}

async function ocrHelperMacos(filepath) {
  if (filepath.toLowerCase().endsWith('.txt')) {
    try {
      const text = await fs.readFile(filepath, 'utf-8');
      return { status: "success", message: { pdfText: text } };
    } catch (error) {
      console.error(`Failed to read text file: ${error.message}`);
      return { status: "error", message: "error" };
    } 
  }

  const { execFile } = require('child_process');
  const execFilePromise = require('util').promisify(execFile);
  
  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar/dist/helper/macos/llmSlide-Helper-MacOS')
    : path.join(__dirname, 'public/helper/macos/llmSlide-Helper-MacOS');
  
  try {
    const { stdout, stderr } = await execFilePromise(helperPath, [filepath]);
    
    if (stderr) {
      console.error(`Error executing command: ${stderr}`);
      return { status: "error", message: stderr };
    }
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Failed to execute OCR helper: ${error.message}`);
    return { status: "error", message: error.message };
  }
}

async function ocrHelperWindows(filepath) {
  if (filepath.toLowerCase().endsWith('.txt')) {
    try {
      const text = await fs.readFile(filepath, 'utf-8');
      return { status: "success", message: { pdfText: text } };
    } catch (error) {
      console.error(`Failed to read text file: ${error.message}`);
      return { status: "error", message: "error" };
    }
  }

  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar/dist/helper/windows/llmSlide-Helper-Windows')
    : path.join(__dirname, 'public/helper/windows/llmSlide-Helper-Windows');

  return { status: "error", message: "Not implemented yet on Windows." };
}




