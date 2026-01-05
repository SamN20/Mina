# Mina Satellite Installer (Windows)
# Automated installer with progress tracking and error recovery

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Clear screen for clean install experience
Clear-Host

# Cool ASCII Art Banner
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "     __  __ ___ _   _   _   " -ForegroundColor Cyan
Write-Host "    |  \/  |_ _| \ | | / \  " -ForegroundColor Cyan
Write-Host "    | |\/| || ||  \| |/ _ \ " -ForegroundColor Cyan
Write-Host "    | |  | || || |\  / ___ \" -ForegroundColor Cyan
Write-Host "    |_|  |_|___|_| \_/_/   \_\" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "         >> Satellite Client Installer <<" -ForegroundColor White
Write-Host "      Control your PC with voice commands!" -ForegroundColor Gray
Write-Host ""
Write-Host "  ------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SatelliteRoot = Split-Path -Parent $ScriptDir  # Go up to satellite folder (parent of advanced/)
$IsInDownloads = $SatelliteRoot -match "\\Downloads\\?"
$SuggestedPath = "$env:LOCALAPPDATA\Mina\Satellite"
$VenvPath = Join-Path $SatelliteRoot "env"
$PythonExe = $null
$TotalSteps = 5
$CurrentStep = 0

function Write-Step {
    param([string]$Message)
    $script:CurrentStep++
    Write-Host "[" -NoNewline
    Write-Host "$script:CurrentStep/$TotalSteps" -ForegroundColor Cyan -NoNewline
    Write-Host "] $Message" -ForegroundColor White
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [+] " -ForegroundColor Green -NoNewline
    Write-Host $Message -ForegroundColor White
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  [!] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "  [X] " -ForegroundColor Red -NoNewline
    Write-Host $Message -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "  [*] " -ForegroundColor Cyan -NoNewline
    Write-Host $Message -ForegroundColor Gray
}

function Check-InstallLocation {
    if ($IsInDownloads) {
        Write-Host ""
        Write-Host "  ================================================" -ForegroundColor DarkGray
        Write-Warning "Installation from Downloads folder detected!"
        Write-Host ""
        Write-Host "  It's recommended to install Mina Satellite to a permanent location." -ForegroundColor Yellow
        Write-Host "  Files in Downloads may be cleaned up automatically." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Suggested location: " -NoNewline -ForegroundColor White
        Write-Host $SuggestedPath -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Options:" -ForegroundColor White
        Write-Host "    [M] Move to suggested location (recommended)" -ForegroundColor Green
        Write-Host "    [C] Continue in current location" -ForegroundColor Yellow
        Write-Host "    [Q] Quit and move manually" -ForegroundColor Gray
        Write-Host ""
        
        $choice = Read-Host "  Your choice (M/C/Q)"
        
        switch ($choice.ToUpper()) {
            "M" {
                Write-Host ""
                Write-Info "Moving installation to $SuggestedPath..."
                
                try {
                    # Remove existing destination if it exists (from previous failed install)
                    if (Test-Path $SuggestedPath) {
                        Write-Info "Removing previous installation attempt..."
                        Remove-Item -Path $SuggestedPath -Recurse -Force -ErrorAction Stop
                    }
                    
                    # Create destination directory
                    New-Item -ItemType Directory -Force -Path $SuggestedPath | Out-Null
                    
                    # Copy all files from satellite root
                    Copy-Item -Path "$SatelliteRoot\*" -Destination $SuggestedPath -Recurse -Force -ErrorAction Stop
                    
                    Write-Success "Files moved successfully"
                    Write-Info "Please run Install.bat from the new location:"
                    Write-Host "  $SuggestedPath\Install.bat" -ForegroundColor Cyan
                    Write-Host ""
                    Write-Host "Press any key to open the new location..." -ForegroundColor DarkGray
                    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                    
                    # Open new location in Explorer
                    Start-Process "explorer.exe" -ArgumentList $SuggestedPath
                    exit 0
                } catch {
                    Write-Error "Failed to move files: $_"
                    Write-Info "You can manually copy the folder to: $SuggestedPath"
                    exit 1
                }
            }
            "C" {
                Write-Host ""
                Write-Success "Continuing installation in current location"
                Write-Host ""
            }
            "Q" {
                Write-Host ""
                Write-Info "Installation cancelled. Please move the folder and run again."
                Write-Host ""
                Write-Host "Press any key to exit..." -ForegroundColor DarkGray
                $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                exit 0
            }
            default {
                Write-Host ""
                Write-Success "Continuing installation in current location"
                Write-Host ""
            }
        }
        Write-Host "  ================================================" -ForegroundColor DarkGray
        Write-Host ""
    }
}

function Ensure-Python {
    Write-Step "Checking Python installation..."
    
    $global:PythonExe = $null
    try {
        $pythonCmd = Get-Command python -ErrorAction Stop
        $global:PythonExe = $pythonCmd.Source
        
        # Check version
        $versionOutput = & python --version 2>&1
        $versionMatch = $versionOutput -match "Python (\d+)\.(\d+)"
        if ($versionMatch) {
            $major = [int]$matches[1]
            $minor = [int]$matches[2]
            
            if ($major -ge 3 -and $minor -ge 10) {
                Write-Success "Python $major.$minor detected"
                return
            } else {
                throw "Python version $major.$minor is too old (need 3.10+)"
            }
        }
    } catch {
        Write-Error "Python 3.10+ is not installed or not in PATH"
        Write-Info "Please install Python from: https://www.python.org/downloads/"
        Write-Info "During installation, check 'Add Python to PATH'"
        Write-Host ""
        Write-Host "Press any key to open the Python download page..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Start-Process "https://www.python.org/downloads/"
        throw "Python installation required"
    }
}

function Ensure-Venv {
    Write-Step "Setting up virtual environment..."
    
    if (Test-Path $VenvPath) {
        Write-Success "Virtual environment already exists"
    } else {
        Write-Info "Creating isolated Python environment..."
        & $global:PythonExe -m venv $VenvPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create virtual environment"
        }
        Write-Success "Virtual environment created"
    }
    
    $global:PythonExe = Join-Path $VenvPath "Scripts/python.exe"
    $global:PipExe = Join-Path $VenvPath "Scripts/pip.exe"
}

function Install-Dependencies {
    Write-Step "Installing Python packages..."
    
    Write-Info "Upgrading pip..."
    & $global:PipExe install --upgrade pip --quiet
    
    # Core packages (required)
    $corePackages = @(
        @{Name="python-socketio[client]"; Display="Socket.IO client"},
        @{Name="aiohttp"; Display="Async HTTP client (required for socketio)"}
    )
    
    # Optional packages (install best effort)
    $optionalPackages = @(
        @{Name="pynput"; Display="Media control support"},
        @{Name="pyautogui"; Display="Media control fallback"},
        @{Name="winsdk"; Display="Windows Media API"},
        @{Name="pystray"; Display="System tray support"},
        @{Name="pillow"; Display="Icon rendering"}
    )
    
    Write-Host ""
    Write-Info "Installing core dependencies..."
    foreach ($pkg in $corePackages) {
        Write-Info "Installing $($pkg.Display)..."
        & $global:PipExe install $pkg.Name --quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install $($pkg.Name) - this is required!"
            throw "Core dependency installation failed"
        }
    }
    
    Write-Host ""
    Write-Info "Installing optional packages..."
    foreach ($pkg in $optionalPackages) {
        Write-Info "Installing $($pkg.Display)..."
        & $global:PipExe install $pkg.Name --quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Optional package $($pkg.Name) failed to install (this is OK)"
        }
    }
    
    Write-Success "All dependencies installed"
}

function Create-Shortcut {
    Write-Step "Creating desktop shortcut..."
    
    try {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $shortcutPath = Join-Path $desktop "Mina Satellite.lnk"
        $targetPath = Join-Path $SatelliteRoot "Start Satellite.bat"
        
        $wshell = New-Object -ComObject WScript.Shell
        $shortcut = $wshell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $targetPath
        $shortcut.WorkingDirectory = $SatelliteRoot
        $shortcut.IconLocation = "$targetPath,0"
        $shortcut.Description = "Mina Satellite - Voice controlled media"
        $shortcut.Save()
        
        Write-Success "Desktop shortcut created"
    } catch {
        Write-Warning "Could not create desktop shortcut"
        Write-Info "You can manually run: Start Satellite.bat"
    }
}

function Show-NextSteps {
    Write-Step "Installation complete!"
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    >> Installation Successful! <<" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. Double-click the 'Mina Satellite' icon on your desktop" -ForegroundColor Gray
    Write-Host "    2. Enter your Discord User ID and server details" -ForegroundColor Gray
    Write-Host "    3. Start using voice commands through Mina!" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Need help?" -ForegroundColor White
    Write-Host "    - Read README.md for troubleshooting" -ForegroundColor Gray
    Write-Host "    - Ask in the Discord server" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor DarkGray
    Write-Host ""
}

# Main installation flow
try {
    Check-InstallLocation
    Ensure-Python
    Ensure-Venv
    Install-Dependencies
    Create-Shortcut
    Show-NextSteps
    
    Write-Host "Press any key to exit..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
    
} catch {
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor DarkGray
    Write-Error "Installation failed: $_"
    Write-Host ""
    Write-Info "Common issues:"
    Write-Host "    - Python not installed or not in PATH" -ForegroundColor Gray
    Write-Host "    - Antivirus blocking installation" -ForegroundColor Gray
    Write-Host "    - No internet connection" -ForegroundColor Gray
    Write-Host ""
    Write-Info "For help, check README.md or ask in Discord"
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
