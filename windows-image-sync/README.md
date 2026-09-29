# Sincronizador de imagens para Windows

Grava as novas imagens enviadas pelo painel no diretório configurado, usando:

- `SKU.jpg` para a imagem principal;
- `SKU-1.jpg` para a segunda;
- `SKU-2.jpg` para a terceira.

Arquivos existentes com o mesmo nome são substituídos. A gravação usa um arquivo
temporário e uma troca atômica para evitar imagens incompletas.

## Instalação

1. Configure `IMAGE_SYNC_AGENT_TOKEN` na Vercel com um token longo e aleatório.
2. Faça uma nova publicação do painel.
3. Copie esta pasta para o Windows que acessa `W:\IMG\produtos`.
4. Abra PowerShell e execute `install.ps1`.
5. Informe o mesmo token configurado na Vercel.

O sincronizador inicia no login do usuário e consulta o painel a cada 20 segundos.
O log fica em `%LOCALAPPDATA%\PitterPanImageSync\sync.log`.

Como a unidade `W:` é mapeada no login do Windows, a tarefa roda na sessão do
mesmo usuário que executou o instalador. Esse usuário precisa permanecer logado.

Para um teste manual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\PitterPanImageSync\sync.ps1" -Once
```

Para remover o sincronizador, execute `uninstall.ps1`.
