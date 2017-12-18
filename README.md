This script does a few simple things:

- Downloads a bunch of posts from the wordpres.com API URL into data.json
- Scans each post's content for image URLs and assigns each image a new unique filename
- Replaces the old URLs with new image URLs
- Downloads all images in the blog_images/ subdirectory
- Saves all posts in the blog_posts directory, in files named as each post's slug (in JSON format)
- Saves all posts in data_converted.json

This was just a quick and dirty script written while learning TypeScript, made for a personal project where I needed to merge an old blog with a new self-hosted one.
If you stumble on this and find it of any use:

- clone repo
- npm install
- modify index.js replacing [BLOG_DOMAIN] and [BLOG_SLUG] with your blog's information
- node index.js
