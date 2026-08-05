const MAC_KEYBOARD_PERMISSION_ERROR = 'macOS 需要“辅助功能”和“输入监控”权限，授权后重新检测。'

function createKeyboardAccessState(platform, granted) {
  const required = platform === 'darwin'
  return {
    required,
    granted: required ? Boolean(granted) : true,
    canRequest: required,
  }
}

function loginItemSettings(platform, openAtLogin, executablePath) {
  if (platform === 'darwin') return { openAtLogin: Boolean(openAtLogin) }
  return { openAtLogin: Boolean(openAtLogin), path: executablePath }
}

function macPrivacySettingsUrl(section = 'accessibility') {
  const pane = section === 'input-monitoring' ? 'Privacy_ListenEvent' : 'Privacy_Accessibility'
  return `x-apple.systempreferences:com.apple.preference.security?${pane}`
}

module.exports = {
  MAC_KEYBOARD_PERMISSION_ERROR,
  createKeyboardAccessState,
  loginItemSettings,
  macPrivacySettingsUrl,
}
