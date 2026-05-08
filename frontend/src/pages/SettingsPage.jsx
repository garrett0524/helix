import SettingsPanel from '../components/Settings/SettingsPanel'

export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure API keys, scraper parameters, and scoring rules</p>
      </div>
      <SettingsPanel />
    </div>
  )
}
