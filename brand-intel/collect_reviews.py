"""
Brand Intelligence Pipeline — Step 1: Data Collection
Collects YouTube comments mentioning a brand using the YouTube Data API v3.

Usage:
  pip install google-api-python-client pandas
  python collect_reviews.py

Before running:
  1. Get a free YouTube Data API key from https://console.cloud.google.com
  2. Set it below or as env var YOUTUBE_API_KEY
"""

import os
import csv
import datetime
from googleapiclient.discovery import build
import pandas as pd

# ── CONFIG ──
API_KEY = os.environ.get("YOUTUBE_API_KEY", "YOUR_KEY_HERE")
BRAND_NAME = "Boat Lifestyle"  # Indian audio brand — niche, not Apple/Sony
SEARCH_QUERY = "boAt earbuds review India"
MAX_VIDEOS = 10
COMMENTS_PER_VIDEO = 15
OUTPUT_FILE = "brand_posts.csv"

def get_youtube_service():
    return build("youtube", "v3", developerKey=API_KEY)

def search_videos(yt, query, max_results=10):
    """Search YouTube for videos about the brand."""
    req = yt.search().list(
        q=query, part="id,snippet", type="video",
        maxResults=max_results, order="relevance",
        publishedAfter="2026-01-01T00:00:00Z"
    )
    resp = req.execute()
    videos = []
    for item in resp.get("items", []):
        videos.append({
            "video_id": item["id"]["videoId"],
            "title": item["snippet"]["title"],
            "published": item["snippet"]["publishedAt"]
        })
    return videos

def get_comments(yt, video_id, max_comments=15):
    """Get top-level comments for a video."""
    comments = []
    try:
        req = yt.commentThreads().list(
            videoId=video_id, part="snippet",
            maxResults=max_comments, order="relevance",
            textFormat="plainText"
        )
        resp = req.execute()
        for item in resp.get("items", []):
            snip = item["snippet"]["topLevelComment"]["snippet"]
            comments.append({
                "post_id": item["id"],
                "source": "YouTube",
                "text": snip["textDisplay"],
                "timestamp": snip["publishedAt"],
                "likes_or_rating": snip.get("likeCount", 0),
                "author": snip.get("authorDisplayName", ""),
                "video_title": ""
            })
    except Exception as e:
        print(f"  Skipping video {video_id}: {e}")
    return comments

def main():
    print(f"Collecting YouTube comments about '{BRAND_NAME}'...")
    yt = get_youtube_service()

    videos = search_videos(yt, SEARCH_QUERY, MAX_VIDEOS)
    print(f"Found {len(videos)} videos")

    all_comments = []
    for v in videos:
        comments = get_comments(yt, v["video_id"], COMMENTS_PER_VIDEO)
        for c in comments:
            c["video_title"] = v["title"]
        all_comments.extend(comments)
        print(f"  {v['title'][:50]}... → {len(comments)} comments")

    # Filter for brand mentions (loose match)
    brand_terms = ["boat", "boAt", "airdopes", "rockerz", "bassheads"]
    filtered = [c for c in all_comments if any(t.lower() in c["text"].lower() for t in brand_terms)]

    # If not enough brand-specific comments, keep all (they're from brand-related videos)
    if len(filtered) < 30:
        filtered = all_comments

    df = pd.DataFrame(filtered)
    df = df[["post_id", "source", "text", "timestamp", "likes_or_rating"]].drop_duplicates(subset=["text"])
    df.to_csv(OUTPUT_FILE, index=False, quoting=csv.QUOTE_ALL)
    print(f"\nSaved {len(df)} comments to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
