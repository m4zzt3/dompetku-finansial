@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Deploy DompetKu to Firebase Hosting

echo ===================================================
echo     DEPLOY DOMPETKU TO FIREBASE HOSTING
echo ===================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di PATH sistem.
    goto END
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm tidak ditemukan.
    goto END
)

where firebase >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Firebase CLI belum terinstal.
    set /p INSTALL_CLI="Install firebase-tools sekarang? (Y/T): "
    if /i "!INSTALL_CLI!"=="Y" (
        call npm install -g firebase-tools
    ) else (
        echo [BATAL] Deploy dibatalkan.
        goto END
    )
)

echo.
echo [1/3] Membangun file project (npm run build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build gagal!
    goto END
)
echo [OK] Build selesai.

echo.
echo [2/3] Memeriksa otentikasi Firebase...
call firebase projects:list >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] Membuka browser untuk login Firebase...
    call firebase login
)

echo.
echo [3/3] Mendeploy ke Firebase Hosting...
call firebase deploy --only hosting

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUKSES] DompetKu berhasil di-deploy ke Firebase!
) else (
    echo.
    echo [GAGAL] Terjadi kesalahan saat deploy.
)

:END
echo.
pause
