# Windows demonstration setup

SmartBasket is a local Next.js application. The project does not need an account, hosting, or network access to display the wizard after its dependencies have been installed.

## Prepare the other laptop

1. Install Node.js LTS from the [official Node.js download page](https://nodejs.org/en/download/). The installed Next.js version requires Node.js 20.9 or newer; the official Windows MSI installer includes npm. See the [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation).
2. Copy the project folder to the laptop using the USB drive. Include `package.json`, `package-lock.json`, `src/`, `scripts/`, `docs/`, and the project configuration files. `node_modules/` and `.next/` can be omitted for the recommended install.
3. While the laptop has internet access, open Command Prompt in the project folder and run:

   ```bat
   npm ci
   ```

   The lockfile installs the pinned dependencies. This step is needed only when dependencies are not already installed on that laptop.

## Start the demonstration

From Command Prompt in the project folder, run:

```bat
npm run dev
```

Open `http://localhost:3000` in Edge or another modern browser. Keep the terminal open during the demonstration; press `Ctrl+C` there to stop the server.

If using PowerShell and script execution blocks `npm`, use `npm.cmd ci` and `npm.cmd run dev` instead.

Wizard answers are saved in local storage on that laptop. The demonstration does not fetch supermarket prices or send answers to a server.

## Offline preparation

Run `npm ci` on the presentation laptop before it is taken offline. For a laptop that cannot connect to the internet at all, dependencies must be prepared in advance on a compatible Windows architecture and copied with the project; copying only the source files and lockfile cannot install packages offline.
