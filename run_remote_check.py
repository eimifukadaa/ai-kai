import paramiko
import sys
import os

# Configuration
HOST = "146.190.90.47"
USERNAME = "root"
PASSWORD = "Fujimori6Riho"
REMOTE_DIR = "/root/kai-chat"

def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, username=USERNAME, password=PASSWORD)
        return client
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        sys.exit(1)

def main():
    print("=== RUNNING RETRIEVAL TEST ON SERVER ===\n")
    client = create_ssh_client()
    sftp = client.open_sftp()
    
    # Upload the check script to the server's worker directory
    local_path = r"d:\2026-kai-ai\worker\check_langsir.go"
    remote_path = f"{REMOTE_DIR}/worker/check_live.go"
    print(f"[*] Uploading {local_path} to {remote_path}...")
    sftp.put(local_path, remote_path)
    sftp.close()
    
    # Run the script on the server
    print("[*] Running check_live.go on server...")
    stdin, stdout, stderr = client.exec_command(f"cd {REMOTE_DIR}/worker && go run check_live.go")
    
    print("\n--- Output ---")
    print(stdout.read().decode())
    print("\n--- Error ---")
    print(stderr.read().decode())
    
    client.close()

if __name__ == "__main__":
    main()
