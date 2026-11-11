; Unsigned, per-user installer. NSIS creates the uninstaller at installation
; time, so cross-building does not need to execute a Windows signing stub.
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "nsProcess.nsh"
Unicode true
RequestExecutionLevel user
Name "${PRODUCT_NAME}"
InstallDir "$LOCALAPPDATA\Programs\Knightfall"
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show
!define MUI_ABORTWARNING
!ifndef MUI_ICON
  !define MUI_ICON "${PROJECT_DIR}/public/icons/icon.ico"
!endif
!ifndef MUI_UNICON
  !define MUI_UNICON "${PROJECT_DIR}/public/icons/icon.ico"
!endif
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro addLangs

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Knightfall requires 64-bit Windows 10 or newer."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext current
FunctionEnd

; Both explicit updates and install-on-exit wait for the old app to close.
; Never terminate an active chess game to force an update.
!macro waitForApp PREFIX
Function ${PREFIX}waitForApp
  StrCpy $0 0
  wait_loop_${PREFIX}:
    ${nsProcess::FindProcess} "Knightfall.exe" $1
    StrCmp $1 0 app_running_${PREFIX} app_closed_${PREFIX}
  app_running_${PREFIX}:
    IntOp $0 $0 + 1
    IntCmp $0 60 ask_close_${PREFIX} sleep_${PREFIX} ask_close_${PREFIX}
  sleep_${PREFIX}:
    Sleep 500
    Goto wait_loop_${PREFIX}
  ask_close_${PREFIX}:
    IfSilent abort_install_${PREFIX}
    MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION "Close Knightfall before continuing. Your saved games and settings will be kept." IDRETRY restart_wait_${PREFIX}
  abort_install_${PREFIX}:
    SetErrorLevel 1
    Abort
  restart_wait_${PREFIX}:
    StrCpy $0 0
    Goto wait_loop_${PREFIX}
  app_closed_${PREFIX}:
    nsProcess::_Unload
FunctionEnd
!macroend
!insertmacro waitForApp ""
!insertmacro waitForApp "un."

Section "Install"
  Call waitForApp
  SetOutPath "$INSTDIR"
  ; Build-time payload comes from the exact verified win-unpacked directory.
  ; File /r uses NSIS's own extraction/error handling, not an external archive.
  File /r "${PROJECT_DIR}/artifacts/windows/win-unpacked/*"
  WriteUninstaller "$INSTDIR\Uninstall Knightfall.exe"
  CreateDirectory "$SMPROGRAMS\Knightfall"
  CreateShortcut "$SMPROGRAMS\Knightfall\Knightfall.lnk" "$INSTDIR\Knightfall.exe"
  CreateShortcut "$DESKTOP\Knightfall.lnk" "$INSTDIR\Knightfall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayName" "Knightfall"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "DisplayIcon" "$INSTDIR\Knightfall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString" '$\"$INSTDIR\Uninstall Knightfall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "QuietUninstallString" '$\"$INSTDIR\Uninstall Knightfall.exe$\" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  ${If} ${isForceRun}
    Exec '$\"$INSTDIR\Knightfall.exe$\"'
  ${Else}
    IfSilent done
    Exec '$\"$INSTDIR\Knightfall.exe$\"'
  ${EndIf}
  done:
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext current
FunctionEnd
Section "Uninstall"
  Call un.waitForApp
  !include "${PROJECT_DIR}/artifacts/windows/knightfall-uninstall-files.nsh"
  Delete "$INSTDIR\Uninstall Knightfall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Knightfall.lnk"
  Delete "$SMPROGRAMS\Knightfall\Knightfall.lnk"
  RMDir "$SMPROGRAMS\Knightfall"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
  ; Deliberately leave app data, Local Elo, saved games and unrelated files.
SectionEnd
