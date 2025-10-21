 # llmSlide — AI 簡報生成器

 一個桌面應用，用於快速產生與編輯 AI 生成的簡報內容（Electron + Vue + Vite 架構）。

 ## 警告⚠️：目前主線`master`版本是使用`System_prompt`進行模型提示，且不包含訂製模型的支援。

 ## 主要功能

 - 使用本地模型生成簡報內容
 - 多套簡報範本與模板支援
 - 匯出簡報或將內容另存為 JSON 以便復用

 ## 前置條件

 - Node.js（建議 v18 以上）
 - npm
 - 在打包或執行前，請將 helper 工具放到指定資料夾（見下方）

 ## 快速開始（開發）

 1. 取得專案

 ```
git clone https://github.com/llmSlide/llmSlide-APP.git
 ```

 2. 安裝相依套件：

 ```
 npm install
 ```

 3. 啟動開發模式：

 ```
 npm run electron-start
 ```

 ## 建置與打包

 產生桌面平台的可執行檔：

 ```
 npm run electron-build
 ```

 ## helper（二進位工具）

 某些相關功能依賴外部 helper 程式，請將它們下載並放到專案的 `public/helper/<platform>`：

 - Windows： [llmSlide-Helper-Windows](https://github.com/llmSlide/llmSlide-Helper-Windows)
 - macOS： [llmSlide-Helper-MacOS](https://github.com/llmSlide/llmSlide-Helper-MacOS)

 Windows：

 ```
 public/helper/windows/<helper-files>
 ```

 macOS：

 ```
 public/helper/macos/<helper-files>
 ```

 注意事項：

 - macOS ：下載後可能需要執行 `chmod +x <file>` 以授予執行權限。
 - Windows：若出現阻擋或權限問題，請確認檔案未被 Windows Defender 或其他安全軟體隔離。

 ## 開發與貢獻

 特別感謝原始專案 PPTist：
[PPTlist](https://github.com/pipipi-pikachu/PPTist)

