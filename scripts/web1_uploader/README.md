# 如何部署資料上傳工具到 web1

這個目錄包含了一個 Python 腳本，讓您可以在 `web1` 伺服器上執行，將最新的 CSV 資料上傳到 Google Drive。

## 1. 準備工作

確保您手邊有以下資訊：
- **Google Drive Folder ID** (您已設定在環境變數中)
- **Service Account Key** (剛剛貼上的 `GOOGLE_PRIVATE_KEY` 那些內容，需存成 json 檔)

## 2. 上傳檔案到 web1

在您的電腦執行 (假設您在專案根目錄)：

```bash
# 1. 建立遠端目錄
ssh web1 "mkdir -p /opt/deploy_dashboard/uploader"

# 2. 複製腳本與設定
scp scripts/web1_uploader/upload_to_drive.py web1:/opt/deploy_dashboard/uploader/
scp scripts/web1_uploader/requirements.txt web1:/opt/deploy_dashboard/uploader/

# 3. (重要) 建立憑證檔案 credentials.json
# 您需要將 Service Account 的完整 JSON 內容貼到 web1 上的這個檔案
ssh web1 "nano /opt/deploy_dashboard/uploader/credentials.json"
```

## 3. 在 web1 安裝依賴

登入 web1 並安裝 Python 套件：

```bash
ssh web1
cd /opt/deploy_dashboard/uploader
pip3 install -r requirements.txt
```

## 4. 執行同步

當您想要同步資料時，執行：

```bash
export GOOGLE_DRIVE_FOLDER_ID="您的資料夾ID"
python3 upload_to_drive.py
```

## 5. (進階) 一鍵同步指令

您可以在本地電腦設定一個別名或腳本：

```bash
# sync_data.sh
ssh web1 "export GOOGLE_DRIVE_FOLDER_ID='...' && cd /opt/deploy_dashboard/uploader && python3 upload_to_drive.py"
```

這樣您只要在本地執行 `./sync_data.sh`，資料就會自動從 web1 上傳到 Drive，儀表板也會即時更新。
