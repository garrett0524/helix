import ScraperControl from '../components/Scraper/ScraperControl'
import ScraperHistory from '../components/Scraper/ScraperHistory'

export default function ScraperPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Scraper Control</h1>
        <p>Run scrapes, import CSV files, and view scrape history</p>
      </div>
      <ScraperControl />
      <ScraperHistory />
    </div>
  )
}
