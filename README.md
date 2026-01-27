# LiG Dashboard (React)

這個前端專案以 React + Vite + TypeScript 重構原本的 Streamlit 儀表板，並延續既有的資料框架與呈現邏輯。

## 專案結構

- `src/context/DashboardDataContext.tsx`：集中處理 CSV 資料載入與基本關聯。
- `src/utils/csv.ts`：封裝 CSV 解析、欄位格式化等共用函式。
- `src/utils/stats.ts`：計算專案排行、指標統計、地圖點位、物件互動等指標。
- `src/App.tsx`：主要頁面（All / Setting）與版面排版。
- `public/data/*.csv`：React 儀表板使用的資料檔案。
- `ref/`：保留第一版 Streamlit 參考程式碼（`app.py`、`function.py` 與相關資源）。

## 開發流程

### 1. 環境變數設定

請確保根目錄有 `.env.local` 檔案（用於前端），以及 `server` 目錄下有 `.env` 檔案（用於後端）。

### 2. 資料庫與 API 服務 (Backend)

本專案使用 Express 作為後端 Proxy 伺服器，負責與 Airtable、Google Drive 及 LiG API 溝通。

```bash
cd server
npm install
npm run dev
```

後端服務預設運行於 `http://localhost:3001`。

### 3. 前端介面 (Frontend)

開啟一個新的終端機視窗，回到專案根目錄並啟動前端開發伺服器：

```bash
npm install
npm run dev
```

前端服務預設運行於 `http://localhost:5173`，且已設定 Proxy 將 `/api` 請求轉發至後端 (localhost:3001)。

## 打包

```bash
npm run build
```

建置的靜態檔案會輸出到 `dist/`。

## 資料更新

React 版本會從 `public/data/` 目錄讀取 CSV，若原始資料有更新，請同步覆蓋對應檔案。主要使用的檔案如下：

- `projects.csv`
- `scandata.csv`
- `obj_click_log.csv`
- `lights.csv`
- `coordinate_systems.csv`
- `ar_objects.csv`
- `scan_coordinate.csv`
- `field.csv`
- `coor_city.csv`

## 參考：Streamlit 初版

原始的 Streamlit 儀表板程式碼已整理到 `ref/` 目錄，包含 `app.py` 與 `function.py`。保留該版本是為 React 改寫時的資料流程參考，如需測試請在虛擬環境中手動執行 `streamlit run ref/app.py`（預設需設定 `DATA_ROOT=public/data`）。

## 下一步建議

- 依企業帳號或登入狀態調整預設的 Owner 篩選。
- 將 API 來源整合為後端 proxy，以替換手動覆蓋 CSV 的流程。
- 依需求延伸 Settings 頁面內容，例如資料同步、權限管理等。
