import os
import sys
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# 設定：請填入您的 Google Drive Folder ID
FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")

# 服務帳號金鑰 (Service Account Key)
# 您可以將金鑰內容存成 credentials.json 並放在同目錄
# 或者直接將內容貼在這裡 (不建議直接貼在 code 裡，建議用環境變數或檔案)
CREDENTIALS_FILE = 'credentials.json'

# 要上傳的檔案清單 (本地路徑)
FILES_TO_UPLOAD = [
    '/opt/deploy_dashboard/data/scandata.csv',
    '/opt/deploy_dashboard/data/obj_click_log.csv'
]

SCOPES = ['https://www.googleapis.com/auth/drive.file']

def authenticate():
    """驗證並建立 Drive Service"""
    creds = None
    if os.path.exists(CREDENTIALS_FILE):
        creds = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES)
    else:
        print(f"找不到 {CREDENTIALS_FILE}，請確認檔案是否存在。")
        sys.exit(1)
    
    return build('drive', 'v3', credentials=creds)

def find_file_in_folder(service, filename, folder_id):
    """查詢資料夾內是否已存在同名檔案"""
    query = f"name = '{filename}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
    return None

def upload_file(service, filepath):
    """上傳或更新檔案"""
    if not os.path.exists(filepath):
        print(f"檔案不存在，跳過: {filepath}")
        return

    filename = os.path.basename(filepath)
    print(f"正在處理: {filename}...")

    file_id = find_file_in_folder(service, filename, FOLDER_ID)
    
    media = MediaFileUpload(filepath, mimetype='text/csv')

    if file_id:
        print(f"  -> 發現舊檔 (ID: {file_id})，執行更新...")
        service.files().update(
            fileId=file_id,
            media_body=media,
            fields='id'
        ).execute()
        print(f"  -> {filename} 更新成功！")
    else:
        print(f"  -> 檔案不存在，執行新增...")
        file_metadata = {
            'name': filename,
            'parents': [FOLDER_ID]
        }
        service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        print(f"  -> {filename} 上傳成功！")

def main():
    if not FOLDER_ID:
        print("錯誤: 請設定環境變數 GOOGLE_DRIVE_FOLDER_ID")
        sys.exit(1)

    print("開始同步資料到 Google Drive...")
    service = authenticate()
    
    for filepath in FILES_TO_UPLOAD:
        upload_file(service, filepath)
    
    print("所有作業完成。")

if __name__ == '__main__':
    main()
