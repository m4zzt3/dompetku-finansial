#!/bin/bash
cd "$(dirname "$0")"

# Clean and create dist
rm -rf dist
mkdir -p dist

# Copy PWA assets
for f in logo-192.png logo-512.png favicon.png logo.png manifest.json sw.js; do
  if [ -f "$f" ]; then
    cp "$f" dist/
    echo "Copied: $f"
  fi
done

# Read stylesheet and js content
STYLESHEET=$(cat Stylesheet.html)
JAVASCRIPT=$(cat JavaScript.html)

# Process each HTML file (exclude shared files)
for file in *.html; do
  if [ "$file" = "Stylesheet.html" ] || [ "$file" = "JavaScript.html" ]; then
    continue
  fi
  echo "Compiling: $file"

  # Create output file
  content=$(cat "$file")

  # Replace include directives
  content=$(echo "$content" | sed "s|<?!= include('Stylesheet'); ?>|$STYLESHEET|g" | sed "s|<?!= include('JavaScript'); ?>|$JAVASCRIPT|g" | sed "s|<?!= serverData ?>|{}|g")

  # Determine output filename
  outname=$(echo "$file" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')

  echo "$content" > "dist/$outname"
  echo "Saved: dist/$outname"
done

echo ""
echo "Build completed successfully!"
echo ""
echo "Files in dist:"
ls -la dist/
