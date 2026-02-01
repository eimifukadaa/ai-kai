import paramiko
import sys

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

def run_command(client, command):
    print(f"\n[*] Running: {command}")
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    
    if out:
        print(f"Output:\n{out}")
    if err:
        print(f"Error:\n{err}")
    
    return out, err, exit_status

def main():
    print("=== FETCHING SERVER LOGS ===\n")
    client = create_ssh_client()
    
    # Check logs for errors
    print("[*] Fetching last 100 lines of kai-chat-web logs...")
    stdin, stdout, stderr = client.exec_command("journalctl -u kai-chat-web -n 100 --no-pager")
    print(stdout.read().decode())
    
    client.close()

if __name__ == "__main__":
    main()
