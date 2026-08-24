const {execFileSync} = require("child_process");

const getGcloudCredential = () => ({
  getAccessToken: async () => {
    const executable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
    const accessToken = execFileSync(executable, ["auth", "print-access-token"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
    }).trim();
    if (!accessToken) throw new Error("GCLOUD_ACCESS_TOKEN_UNAVAILABLE");
    return {access_token: accessToken, expires_in: 3300};
  },
});

module.exports = {getGcloudCredential};
