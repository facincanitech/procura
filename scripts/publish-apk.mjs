// Publica o APK no GitHub Releases (tag "latest", nome fixo procura.apk) e marca a versão em version.json.
// O app compara version.json → androidVersion com a versão instalada e oferece a atualização.
//
// Uso (na raiz do repo):
//   1. Suba versionCode/versionName em mobile/android/app/build.gradle
//   2. Gere o APK no Android Studio (Build → Generate Signed App Bundle / APK → APK, release)
//   3. $env:GITHUB_TOKEN="ghp_..."; node scripts/publish-apk.mjs mobile/android/app/release/app-release.apk
//   4. git add version.json; git commit; git push   (o app lê version.json do GitHub Pages)
import fs from "node:fs";

const OWNER = "facincanitech";
const REPO = "procura";
const TAG = "latest";
const token = process.env.GITHUB_TOKEN;
const apkPath = process.argv[2] || "mobile/android/app/release/app-release.apk";

if (!token) throw new Error("Defina GITHUB_TOKEN (token do GitHub com permissão de escrita em Contents).");
if (!fs.existsSync(apkPath)) throw new Error(`APK não encontrado: ${apkPath}`);

const gradle = fs.readFileSync("mobile/android/app/build.gradle", "utf8");
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!version) throw new Error("versionName não encontrado no build.gradle");

const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

// recria o release "latest" para o link fixo sempre apontar para o APK novo
const old = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
if (old.ok) {
  const r = await old.json();
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${r.id}`, { method: "DELETE", headers });
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/tags/${TAG}`, { method: "DELETE", headers });
  console.log("Release anterior removido");
}
const created = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ tag_name: TAG, name: `Procura v${version}`, body: `App Android do Procura v${version}.`, draft: false, prerelease: false }),
});
if (!created.ok) throw new Error(`criar release falhou: ${await created.text()}`);
const release = await created.json();

const apk = fs.readFileSync(apkPath);
// "procura.apk" é o nome fixo usado pelo site e pelo app; a cópia com versão é só para histórico
for (const name of ["procura.apk", `procura-v${version}.apk`]) {
  const up = await fetch(release.upload_url.replace("{?name,label}", `?name=${name}`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.android.package-archive", "Content-Length": String(apk.length) },
    body: apk,
  });
  if (!up.ok) throw new Error(`upload de ${name} falhou: ${await up.text()}`);
  console.log("Enviado:", (await up.json()).browser_download_url);
}

const v = JSON.parse(fs.readFileSync("version.json", "utf8"));
v.androidVersion = version;
if (!v.version || v.version < version) v.version = version;
fs.writeFileSync("version.json", JSON.stringify(v, null, 2) + "\n");
console.log(`version.json → androidVersion ${version}. Agora faça commit e push do version.json.`);
