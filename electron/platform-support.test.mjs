import { describe, expect, it } from 'vitest'
import platformSupport from './platform-support.cjs'

const {
  createKeyboardAccessState,
  loginItemSettings,
  macPrivacySettingsUrl,
} = platformSupport

describe('platform support', () => {
  it('only requires keyboard permission on macOS', () => {
    expect(createKeyboardAccessState('darwin', false)).toEqual({
      required: true,
      granted: false,
      canRequest: true,
    })
    expect(createKeyboardAccessState('win32', false)).toEqual({
      required: false,
      granted: true,
      canRequest: false,
    })
  })

  it('uses the platform-specific login item shape', () => {
    expect(loginItemSettings('darwin', true, '/Applications/app')).toEqual({ openAtLogin: true })
    expect(loginItemSettings('win32', true, 'C:\\app.exe')).toEqual({
      openAtLogin: true,
      path: 'C:\\app.exe',
    })
  })

  it('opens the requested macOS privacy pane', () => {
    expect(macPrivacySettingsUrl('accessibility')).toContain('Privacy_Accessibility')
    expect(macPrivacySettingsUrl('input-monitoring')).toContain('Privacy_ListenEvent')
  })
})
