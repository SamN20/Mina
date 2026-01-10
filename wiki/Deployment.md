# Deployment Guide

This guide covers how to run Mina as a persistent background service on a Linux server.

## Systemd Service (Recommended)

Running Mina as a systemd service ensures it starts automatically when the server boots and restarts if it crashes.

### 1. Create Service File
Create a file named `/etc/systemd/system/mina.service`:
(Adjust the paths to match your installation, e.g., `/root/Mina`)

```ini
[Unit]
Description=Mina Discord Bot
After=network.target

[Service]
# User to run the bot as (usually root or your user)
User=root
WorkingDirectory=/root/Mina

# Command to start the bot
# We use the helper script which sets up environment if needed
ExecStart=/root/Mina/start_bot.sh

# Restart automatically if it crashes
Restart=always
RestartSec=10

# Output logs to syslog/journald
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mina

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start
Reload the systemd daemon to recognize the new file:
```bash
sudo systemctl daemon-reload
```

Enable the service to start on boot:
```bash
sudo systemctl enable mina
```

Start the service immediately:
```bash
sudo systemctl start mina
```

### 3. View Logs
You can view the real-time logs using `journalctl`:
```bash
sudo journalctl -u mina -f
```

## Docker (Experimental)
A `Dockerfile` is not yet included in the official repository, but you can build one using `Node:20`. Note that you will need to install `ffmpeg` and `python3` inside the container.
