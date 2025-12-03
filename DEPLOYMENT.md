# Deployment Guide

本指南將協助您將應用程式部署到 Render (後端) 和 Vercel (前端)，並使用 Google Drive 作為資料來源。

## 1. Google Drive 設定 (資料來源)

為了讓後端能讀取 Google Drive 上的 CSV 檔案，我們需要設定一個 Service Account。

### 1.1 建立 Google Service Account
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立一個新專案 (例如 `ZooDashboard`)。
3. 在左側選單選擇 **IAM 與管理** > **服務帳戶**。
4. 點擊 **建立服務帳戶**。
5. 輸入名稱 (例如 `drive-reader`)，點擊 **建立並繼續**。
6. 角色選擇 **基本** > **檢視者** (Viewer)，點擊 **繼續** > **完成**。
7. 在服務帳戶列表中，點擊剛剛建立的帳號 (Email 類似 `drive-reader@project-id.iam.gserviceaccount.com`)。
8. 進入 **金鑰** 分頁，點擊 **新增金鑰** > **建立新金鑰** > **JSON**。
9. 下載 JSON 檔案，打開它，複製 `private_key` (包含 `-----BEGIN PRIVATE KEY-----`) 和 `client_email`。

### 1.2 啟用 Google Drive API
1. 在 Google Cloud Console 搜尋 **Google Drive API**。
2. 點擊 **啟用**。

### 1.3 設定 Google Drive 資料夾
1. 在 Google Drive 建立一個資料夾 (例如 `DashboardData`)。
2. 將您的 CSV 檔案 (`projects.csv`, `scandata.csv` 等) 上傳到此資料夾。
3. 對該資料夾點擊右鍵 > **共用**。
4. 在「新增使用者」欄位，貼上剛剛複製的 **Service Account Email** (`client_email`)。
5. 權限設為 **檢視者**，點擊 **傳送**。
6. 複製該資料夾的網址，網址最後一段即為 **Folder ID** (例如 `1A2B3C...`)。

---

## 2. 後端部署 (Render)

### 2.1 準備 GitHub
確保您的程式碼已推送到 GitHub。

### 2.2 建立 Web Service
1. 註冊/登入 [Render](https://render.com/)。
2. 點擊 **New +** > **Web Service**。
3. 連結您的 GitHub 儲存庫。
4. 設定如下：
    - **Name**: `zoo-dashboard-server` (自訂)
    - **Root Directory**: `server`
    - **Environment**: `Node`
    - **Build Command**: `npm install && npm run build`
    - **Start Command**: `npm start`
5. 在 **Environment Variables** 區塊，新增以下變數：
    - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: (填入 JSON 中的 `client_email`)
    - `GOOGLE_PRIVATE_KEY`: (填入 JSON 中的 `private_key`，包含換行符號)
    - `GOOGLE_DRIVE_FOLDER_ID`: (填入 Google Drive 資料夾 ID)
    - `AIRTABLE_PAT`: (若有使用 Airtable)
    - `AIRTABLE_BASE_ID`: (若有使用 Airtable)
    - `LIG_API_BASE`: `https://api.lig.com.tw`
6. 點擊 **Create Web Service**。
7. 等待部署完成，複製 Render 提供的 URL (例如 `https://zoo-dashboard-server.onrender.com`)。

---

## 3. 前端部署 (Vercel)

### 3.1 設定 Vercel
1. 註冊/登入 [Vercel](https://vercel.com/)。
2. 點擊 **Add New ...** > **Project**。
3. 匯入您的 GitHub 儲存庫。
4. 設定如下：
    - **Framework Preset**: `Vite`
    - **Root Directory**: `./` (預設)
5. 點擊 **Deploy**。

### 3.2 設定 Rewrite (串接後端)
1. 部署完成後，回到專案的程式碼。
2. 打開 `vercel.json` 檔案。
3. 將 `destination` 修改為您的 Render 後端網址：
    ```json
    {
      "rewrites": [
        {
          "source": "/api/:path*",
          "destination": "https://您的-RENDER-網址.onrender.com/api/:path*"
        }
      ]
    }
    ```
4. 將修改推送到 GitHub，Vercel 會自動重新部署。

---

## 4. 驗證
1. 打開 Vercel 提供的網址。
2. 檢查是否能正常顯示圖表數據 (這些數據現在來自 Google Drive)。
3. 若有問題，請檢查 Render 的 Logs 是否有錯誤訊息 (例如權限不足或檔案找不到)。
