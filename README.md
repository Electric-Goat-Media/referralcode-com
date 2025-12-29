# ReferralCode.com

Verified referral codes that actually work. A static site hosted on GitHub Pages.

## Overview

This site uses a simple static site generator to manage referral deals. All deal data is stored in markdown files with YAML front matter, making it easy to add, update, or remove deals without touching any code.

## Project Structure

```
referralcode-com/
├── _data/
│   ├── deals/           # Markdown files for each deal
│   │   ├── gusto.md
│   │   ├── mercury.md
│   │   └── ...
│   └── categories.json  # Optional category descriptions
├── logos/               # Downloaded company logos (auto-generated)
├── deal/                # Generated deal pages
├── [category-slug]/     # Generated category pages
├── .env                 # Environment variables (not committed)
├── build.js             # Static site generator
├── style.css            # Site styles
├── index.html           # Generated homepage
├── sitemap.xml          # Generated sitemap
└── robots.txt           # Generated robots.txt
```

## Adding a New Deal

1. Create a new markdown file in `_data/deals/[company-slug].md`
2. Use this template:

```markdown
---
company: Company Name
slug: company-slug
category: Category Name
benefit: Short benefit description
benefitAmount: $100
code: PROMOCODE123           # Or omit if using link only
codeType: code               # Either "code" or "link"
url: https://company.com/referral-link
metaTitle: Company Referral Code 2025 - Benefit | ReferralCode.com
metaDescription: SEO-optimized description with keywords and benefit details.
priority: 1                  # Lower = higher priority on homepage
---

Short intro paragraph about the offer.

Longer description about the company and what they offer.

## What You Get

- Benefit 1
- Benefit 2
- Benefit 3

## How to Claim

1. Step 1
2. Step 2
3. Step 3

Additional information about the deal.
```

3. Run `npm run build` to regenerate the site
4. Commit and push to GitHub

## Building the Site

```bash
# Build the site
npm run build

# Or run directly with Node
node build.js
```

This will:
- Read all deal files from `_data/deals/`
- Download missing company logos from logo.dev
- Generate the homepage
- Generate individual deal pages
- Generate category pages
- Create sitemap.xml and robots.txt

### Company Logos

Company logos are automatically downloaded from [logo.dev](https://logo.dev) during the build process. The build script:

1. Extracts the domain from each deal's URL
2. Downloads the logo from logo.dev API
3. Saves logos to the `/logos/` directory
4. Automatically includes logos in deal cards and pages
5. Skips re-downloading logos that already exist

**Setup:**

To enable logo downloading, create a `.env` file in the root directory:

```bash
LOGO_DEV_TOKEN=your_token_here
```

The `.env` file is gitignored and won't be committed to the repository. Logos are also gitignored as they can be regenerated from the build script.

## SEO Features

The build system automatically generates:

- **Canonical tags** - `rel="canonical"` on every page to prevent duplicate content issues
- **Custom meta tags** - Title and description for each page
- **Open Graph tags** - For social media sharing
- **Twitter Card tags** - For Twitter previews
- **Structured data** - JSON-LD schema for offers
- **Breadcrumbs** - Hierarchical navigation
- **Sitemap** - XML sitemap for search engines
- **Internal linking** - Related deals and category links
- **Minified HTML** - Clean, compact HTML output

## GitHub Pages Deployment

1. Push changes to the `main` branch
2. Ensure GitHub Pages is enabled in repository settings
3. Set source to deploy from the root of the `main` branch
4. Site will be live at `https://[username].github.io/referralcode-com/`

## Managing Deals

### Updating a Deal

Edit the markdown file in `_data/deals/` and rebuild.

### Removing a Deal

Delete the markdown file and rebuild. The build script will automatically clean up old generated pages.

### Changing Deal Priority

Adjust the `priority` field in the front matter. Lower numbers appear first on the homepage.

### Adding New Categories

Categories are automatically created based on the `category` field in deal files. Category slugs are auto-generated from category names (e.g., "Small Business" → "small-business").

### Adding Category Blurbs

To add descriptive text to category pages:

1. Create or edit `_data/categories.json`
2. Add entries using the category slug as the key:

```json
{
  "small-business": "Your description here...",
  "banking": "Another description..."
}
```

3. Rebuild the site

## Development Tips

- **No dependencies** - The build script uses only Node.js built-ins
- **Fast builds** - Entire site builds in <1 second
- **Simple markdown** - Basic markdown parsing built-in
- **Version control** - All deal data is in version-controlled markdown files
- **Free hosting** - GitHub Pages is completely free

## Customization

### Styling

Edit [style.css](style.css) to change colors, fonts, or layout.

### Templates

Edit [build.js](build.js) to modify page templates or add new features.

### Domain

To use a custom domain:
1. Add a `CNAME` file with your domain
2. Configure DNS to point to GitHub Pages
3. Enable custom domain in GitHub repository settings

## License

MIT License - feel free to use this for your own projects!

---

**Electric Goat Media, LLC**
