#!/usr/bin/env python3
"""
TesseraFlow Google Maps Scraper
Scrapes business data from Google Maps for lead generation.

Usage:
    python google_maps_scraper.py --category restaurants --geography "Long Island, NY" --radius 10

Note: This is an MVP scraper. For production use, consider:
- Proxy rotation
- Better rate limiting
- Playwright/Puppeteer for JS-rendered content
- Google Places API (paid) for reliable results

For now, CSV import is the recommended fallback method.
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.parse
import os

def load_config():
    """Load scraper config from config.json"""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return {}

def scrape_google_maps(category, geography, radius=10):
    """
    Scrape Google Maps for businesses matching category in geography.
    Returns list of business data dicts.

    NOTE: Direct scraping of Google Maps is unreliable without browser automation.
    This function serves as the structure/interface for the scraper.
    For MVP, use CSV import as the primary data ingestion method.
    """
    results = []

    # Build search query
    query = f"{category} in {geography}"

    print(f"Searching for: {query}", file=sys.stderr)
    print(f"Radius: {radius} miles", file=sys.stderr)

    # TODO: Implement actual Google Maps scraping
    # Options:
    # 1. Playwright/Puppeteer browser automation
    # 2. Google Places API (requires API key, costs money)
    # 3. SerpAPI or similar service
    # 4. Manual CSV export from Google Maps

    # For now, generate sample data to demonstrate the pipeline
    sample_businesses = [
        {
            "business_name": "The Rusty Anchor Bar & Grill",
            "category": "Bar",
            "address": "145 Main Street",
            "city": "Huntington",
            "state": "NY",
            "zip": "11743",
            "phone": "(631) 555-0101",
            "website": "https://rustyanchorbar.com",
            "google_rating": 4.5,
            "review_count": 234,
            "place_id": "ChIJ_sample_001",
            "owner_name": "Mike Johnson"
        },
        {
            "business_name": "Iron Works Fitness",
            "category": "Gym",
            "address": "88 Broadway",
            "city": "Babylon",
            "state": "NY",
            "zip": "11702",
            "phone": "(631) 555-0102",
            "website": "https://ironworksfitness.com",
            "google_rating": 4.7,
            "review_count": 189,
            "place_id": "ChIJ_sample_002",
            "owner_name": "Sarah Chen"
        },
        {
            "business_name": "Napoli Pizza & Restaurant",
            "category": "Restaurant",
            "address": "322 Deer Park Ave",
            "city": "Deer Park",
            "state": "NY",
            "zip": "11729",
            "phone": "(631) 555-0103",
            "website": None,
            "google_rating": 4.2,
            "review_count": 156,
            "place_id": "ChIJ_sample_003",
            "owner_name": None
        },
        {
            "business_name": "CrossFit Long Island",
            "category": "Gym",
            "address": "50 Engineers Drive",
            "city": "Hicksville",
            "state": "NY",
            "zip": "11801",
            "phone": "(516) 555-0201",
            "website": "https://crossfitli.com",
            "google_rating": 4.8,
            "review_count": 312,
            "place_id": "ChIJ_sample_004",
            "owner_name": "Tom Rivera"
        },
        {
            "business_name": "O'Malley's Irish Pub",
            "category": "Bar",
            "address": "67 New York Ave",
            "city": "Smithtown",
            "state": "NY",
            "zip": "11787",
            "phone": "(631) 555-0104",
            "website": "https://omalleys-pub.com",
            "google_rating": 4.3,
            "review_count": 98,
            "place_id": "ChIJ_sample_005",
            "owner_name": "Pat O'Malley"
        },
        {
            "business_name": "Planet Fitness Commack",
            "category": "Gym",
            "address": "2020 Jericho Turnpike",
            "city": "Commack",
            "state": "NY",
            "zip": "11725",
            "phone": "(631) 555-0105",
            "website": "https://planetfitness.com",
            "google_rating": 4.0,
            "review_count": 445,
            "place_id": "ChIJ_sample_006",
            "owner_name": None
        },
        {
            "business_name": "The Blue Point Brewing Co",
            "category": "Bar",
            "address": "161 River Ave",
            "city": "Patchogue",
            "state": "NY",
            "zip": "11772",
            "phone": "(631) 555-0106",
            "website": "https://bluepointbrewing.com",
            "google_rating": 4.6,
            "review_count": 567,
            "place_id": "ChIJ_sample_007",
            "owner_name": "Mark Burford"
        },
        {
            "business_name": "Mama Theresa's Ristorante",
            "category": "Restaurant",
            "address": "4025 Hempstead Tpke",
            "city": "Bethpage",
            "state": "NY",
            "zip": "11714",
            "phone": "(516) 555-0202",
            "website": "https://mamatheresas.com",
            "google_rating": 4.4,
            "review_count": 203,
            "place_id": "ChIJ_sample_008",
            "owner_name": "Angela Moretti"
        }
    ]

    # Filter by category if specified
    if category:
        cat_lower = category.lower()
        for biz in sample_businesses:
            biz_cat = (biz.get("category") or "").lower()
            if cat_lower in biz_cat or biz_cat in cat_lower or cat_lower in ["all", "restaurants", "bars", "gyms"]:
                results.append(biz)
            # Match broader categories
            if cat_lower in ["restaurants", "restaurant"] and biz_cat in ["restaurant", "bar"]:
                if biz not in results:
                    results.append(biz)
            if cat_lower in ["gyms", "gym", "fitness"] and biz_cat in ["gym"]:
                if biz not in results:
                    results.append(biz)
    else:
        results = sample_businesses

    return results

def post_to_api(leads, api_url="http://localhost:3001/api/leads"):
    """Post scraped leads to the TesseraFlow API"""
    imported = 0
    skipped = 0

    for lead in leads:
        try:
            data = json.dumps(lead).encode('utf-8')
            req = urllib.request.Request(
                api_url,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            response = urllib.request.urlopen(req)
            if response.status == 201:
                imported += 1
            else:
                skipped += 1
        except urllib.error.HTTPError as e:
            if e.code == 409:  # Duplicate
                skipped += 1
            else:
                print(f"Error posting lead {lead.get('business_name')}: {e}", file=sys.stderr)
                skipped += 1
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            skipped += 1

    return imported, skipped

def save_to_csv(leads, output_path="scraped_leads.csv"):
    """Save leads to CSV file as fallback"""
    import csv

    if not leads:
        return

    fields = list(leads[0].keys())
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(leads)

    print(f"Saved {len(leads)} leads to {output_path}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description='TesseraFlow Google Maps Scraper')
    parser.add_argument('--category', default='restaurants', help='Business category to search')
    parser.add_argument('--geography', default='Long Island, NY', help='Geographic area to search')
    parser.add_argument('--radius', type=int, default=10, help='Search radius in miles')
    parser.add_argument('--output', choices=['api', 'csv', 'both'], default='api', help='Output destination')
    parser.add_argument('--csv-path', default='scraped_leads.csv', help='CSV output path')

    args = parser.parse_args()

    print(f"Starting scrape: {args.category} in {args.geography}", file=sys.stderr)

    # Run scraper
    leads = scrape_google_maps(args.category, args.geography, args.radius)

    print(f"Found {len(leads)} businesses", file=sys.stderr)

    imported = 0
    skipped = 0

    if args.output in ['api', 'both']:
        imported, skipped = post_to_api(leads)
        print(f"API import: {imported} imported, {skipped} skipped", file=sys.stderr)

    if args.output in ['csv', 'both']:
        save_to_csv(leads, args.csv_path)

    # Output JSON result on last line (for parent process to parse)
    result = {
        "found": len(leads),
        "imported": imported,
        "skipped": skipped
    }
    print(json.dumps(result))

if __name__ == '__main__':
    main()
