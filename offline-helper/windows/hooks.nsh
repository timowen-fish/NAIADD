!macro NSIS_HOOK_POSTINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\NAIADD.lnk"
  Delete "$SMPROGRAMS\NAIADD.lnk"

  CreateShortcut "$DESKTOP\NAIADD.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--launch-naiadd" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  CreateShortcut "$SMPROGRAMS\NAIADD.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--launch-naiadd" "$INSTDIR\${MAINBINARYNAME}.exe" 0

  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\NAIADD.lnk"
  Delete "$SMPROGRAMS\NAIADD.lnk"
!macroend
