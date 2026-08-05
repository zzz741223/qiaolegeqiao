const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = async function adHocSignMac(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.QIAO_ADHOC_SIGN !== 'true') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  const entitlements = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist')

  execFileSync('codesign', [
    '--force',
    '--deep',
    '--options', 'runtime',
    '--timestamp=none',
    '--entitlements', entitlements,
    '--identifier', 'com.qiaolegeqiao.desktop',
    '--sign', '-',
    appPath,
  ], { stdio: 'inherit' })
}
