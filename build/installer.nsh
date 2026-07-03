; Hook del desinstalador de Paput Client.
; electron-builder incluye este archivo y llama a la macro `customUnInstall`
; al final de la desinstalación. Aquí ofrecemos borrar TODOS los datos del
; usuario (mods, Java descargado, mundos locales y ajustes), que el instalador
; NSIS normalmente deja en %APPDATA% y ocupan varios GB.
!macro customUnInstall
  ; En desinstalación silenciosa el valor por defecto es "No" (/SD IDNO): no se
  ; borran los datos sin preguntar. En modo normal se pregunta al usuario.
  MessageBox MB_YESNO|MB_ICONQUESTION "¿Borrar también todos los datos de Paput Client?$\n$\nSe eliminarán los mods, el Java descargado, los mundos locales y los ajustes (libera varios GB). Si piensas reinstalar y quieres conservarlos, pulsa No." /SD IDNO IDNO PaputKeepData
    ; Datos del juego (instancias, Java, assets, mods…)
    RMDir /r "$APPDATA\.tensoclient"
    ; Ajustes de la app (carpeta userData de Electron)
    RMDir /r "$APPDATA\Paput Client"
  PaputKeepData:
!macroend
