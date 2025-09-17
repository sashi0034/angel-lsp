# Installing a Specific Version of the Extension (Outside the VSCode Marketplace)

Sometimes, the latest release on the VSCode Marketplace may accidentally include a bug.

If you encounter issues with the newest version, you can install a different version of the extension by following the steps below.


## Step 1. Download the `.vsix` file

A `.vsix` file is a packaged version of a VSCode extension.

You can obtain `.vsix` files from the GitHub Actions page of this project.

1. Go to the **Actions** tab on GitHub.

2. Find the workflow run corresponding to the version you want.

3. Download the generated `.vsix` artifact from that run.


## Step 2. Install from VSIX in VSCode

1. Open VSCode.

2. Go to the **Extensions** view.

3. Click on the **...** (More Actions) menu in the Extensions view.

4. Choose **"Install from VSIX..."**.

5. Select the `.vsix` file you downloaded.

After installation, the selected version of the extension will be active in your VSCode environment.
