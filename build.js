#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get current year dynamically
const CURRENT_YEAR = new Date().getFullYear();

// Utility: Generate slug from string
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Utility: Minify HTML
function minifyHtml(html) {
  return html
    .replace(/\n\s*\n/g, '\n') // Remove multiple blank lines
    .replace(/\n\s+</g, '\n<')  // Remove leading spaces before tags
    .replace(/>\s+\n/g, '>\n')  // Remove trailing spaces after tags
    .replace(/\n+/g, '\n')      // Normalize to single newlines
    .trim();
}

// Utility: Parse markdown with YAML front matter
function parseMarkdown(content) {
  const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontMatterRegex);

  if (!match) {
    throw new Error('Invalid markdown format - missing front matter');
  }

  const frontMatter = {};
  const yamlLines = match[1].split('\n');

  yamlLines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > -1) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Parse booleans and numbers
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(value) && value !== '') value = Number(value);

      frontMatter[key] = value;
    }
  });

  return {
    data: frontMatter,
    content: match[2].trim()
  };
}

// Utility: Convert markdown to HTML (improved implementation)
function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let inList = false;
  let listType = null;
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) {
        result.push(`                    <p>${text}</p>`);
      }
      currentParagraph = [];
    }
  };

  const closeList = () => {
    if (inList) {
      result.push(listType === 'ul' ? '                </ul>' : '                </ol>');
      inList = false;
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      flushParagraph();
      closeList();
      result.push(`                    <h3>${line.substring(4)}</h3>`);
    } else if (line.startsWith('## ')) {
      flushParagraph();
      closeList();
      result.push(`                    <h2>${line.substring(3)}</h2>`);
    } else if (line.startsWith('# ')) {
      flushParagraph();
      closeList();
      result.push(`                    <h1>${line.substring(2)}</h1>`);
    }
    // Unordered list items
    else if (line.startsWith('- ')) {
      flushParagraph();
      if (!inList || listType !== 'ul') {
        closeList();
        result.push('                <ul>');
        inList = true;
        listType = 'ul';
      }
      let itemText = line.substring(2);
      // Process bold and links within list items
      itemText = itemText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      itemText = itemText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
      result.push(`                    <li>${itemText}</li>`);
    }
    // Ordered list items
    else if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      if (!inList || listType !== 'ol') {
        closeList();
        result.push('                <ol>');
        inList = true;
        listType = 'ol';
      }
      let itemText = line.replace(/^\d+\.\s/, '');
      // Process bold and links within list items
      itemText = itemText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      itemText = itemText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
      result.push(`                    <li>${itemText}</li>`);
    }
    // Regular paragraph text
    else {
      closeList();
      // Process bold and links
      let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      processedLine = processedLine.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
      currentParagraph.push(processedLine);
    }
  }

  flushParagraph();
  closeList();

  return result.join('\n');
}

// Read all deal files
function loadDeals() {
  const dealsDir = path.join(__dirname, '_data/deals');
  const files = fs.readdirSync(dealsDir).filter(f => f.endsWith('.md'));

  return files.map(file => {
    const content = fs.readFileSync(path.join(dealsDir, file), 'utf-8');
    const parsed = parseMarkdown(content);

    // Auto-generate slugs if not provided
    const data = {
      ...parsed.data,
      categorySlug: parsed.data.categorySlug || slugify(parsed.data.category),
      verified: true, // All deals in markdown are considered verified
      successRate: parsed.data.successRate || 100, // Default to 100%
      bodyContent: parsed.content,
      bodyHtml: markdownToHtml(parsed.content)
    };

    return data;
  }).sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

// Load category blurbs (optional)
function loadCategoryBlurbs() {
  const blurbsPath = path.join(__dirname, '_data/categories.json');
  if (fs.existsSync(blurbsPath)) {
    const content = fs.readFileSync(blurbsPath, 'utf-8');
    return JSON.parse(content);
  }
  return {};
}

// Get unique categories
function getCategories(deals) {
  const categoryMap = new Map();
  const blurbs = loadCategoryBlurbs();

  deals.forEach(deal => {
    if (!categoryMap.has(deal.categorySlug)) {
      categoryMap.set(deal.categorySlug, {
        name: deal.category,
        slug: deal.categorySlug,
        blurb: blurbs[deal.categorySlug] || null,
        deals: []
      });
    }
    categoryMap.get(deal.categorySlug).deals.push(deal);
  });

  return Array.from(categoryMap.values());
}

// Generate base HTML template
function getBaseTemplate({ title, description, content, breadcrumbs = [], depth = 0, canonicalUrl = '', includeSitemapLink = false, deals = [] }) {
  const pathPrefix = depth > 0 ? '../'.repeat(depth) : './';

  // Add sitemap link tag for homepage
  const sitemapLinkTag = includeSitemapLink ? `<link rel="sitemap" type="application/xml" title="Sitemap" href="${pathPrefix}sitemap.xml">` : '';

  // Generate search data
  const searchData = deals.map(deal => ({
    company: deal.company,
    category: deal.category,
    benefit: deal.benefit,
    slug: deal.slug,
    url: `${pathPrefix}deal/${deal.slug}/index.html`
  }));

  const breadcrumbHtml = breadcrumbs.length > 0 ? `
<nav class="breadcrumbs">
<div class="container">
${breadcrumbs.map((crumb, i) => {
    if (i === breadcrumbs.length - 1) {
        return `<span>${crumb.label}</span>`;
    }
    return `<a href="${crumb.url}">${crumb.label}</a>`;
}).join(' <span class="separator">/</span> ')}
</div>
</nav>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonicalUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${sitemapLinkTag}
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@400;600&family=Montserrat:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${pathPrefix}style.css">
</head>
<body>
<nav>
<div class="container">
<a href="${pathPrefix}index.html" class="logo">ReferralCode.com</a>
<div class="nav-right">
<div class="search-container">
<input type="text" class="search-input" placeholder="Search deals..." id="search-input">
<div class="search-results" id="search-results"></div>
</div>
<ul>
<li><a href="${pathPrefix}index.html#deals">Top Deals</a></li>
<li><a href="${pathPrefix}index.html#how-it-works">How It Works</a></li>
<li><a href="${pathPrefix}index.html#about">About</a></li>
</ul>
</div>
</div>
</nav>
${breadcrumbHtml}
${content}
<footer id="about">
<div class="container">
<p><strong>ReferralCode.com</strong> - Honest referral codes that work.</p>
<p>Questions? <a href="mailto:hello@referralcode.com">hello@referralcode.com</a></p>
<p class="footer-small">© 2025 Electric Goat Media, LLC. 1821 W Hubbard St Unit 209-90 Chicago, IL 60622.</p>
</div>
</footer>
<script>
// Search functionality with autocorrect and autosuggest
const searchData = ${JSON.stringify(searchData)};

// Levenshtein distance for autocorrect
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Search with autocorrect and fuzzy matching
function searchDeals(query) {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const results = [];

  searchData.forEach(deal => {
    const companyLower = deal.company.toLowerCase();
    const categoryLower = deal.category.toLowerCase();
    const benefitLower = deal.benefit.toLowerCase();

    let score = 0;
    let matchType = '';

    // Exact match (highest priority)
    if (companyLower.includes(lowerQuery)) {
      score = 100 - companyLower.indexOf(lowerQuery);
      matchType = 'exact';
    } else if (categoryLower.includes(lowerQuery)) {
      score = 80 - categoryLower.indexOf(lowerQuery);
      matchType = 'category';
    } else if (benefitLower.includes(lowerQuery)) {
      score = 60 - benefitLower.indexOf(lowerQuery);
      matchType = 'benefit';
    } else {
      // Fuzzy match with autocorrect
      const companyDistance = levenshteinDistance(lowerQuery, companyLower);
      const categoryDistance = levenshteinDistance(lowerQuery, categoryLower);

      // Allow up to 2 character differences for autocorrect
      if (companyDistance <= 2 && companyDistance < companyLower.length * 0.4) {
        score = 40 - companyDistance;
        matchType = 'fuzzy';
      } else if (categoryDistance <= 2 && categoryDistance < categoryLower.length * 0.4) {
        score = 30 - categoryDistance;
        matchType = 'fuzzy';
      }
    }

    if (score > 0) {
      results.push({ ...deal, score, matchType });
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Search UI
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

let searchTimeout;

searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();

  if (query.length < 2) {
    searchResults.style.display = 'none';
    return;
  }

  searchTimeout = setTimeout(() => {
    const results = searchDeals(query);

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-result-empty">No deals found. Try a different search.</div>';
      searchResults.style.display = 'block';
      return;
    }

    searchResults.innerHTML = results.map(result => \`
      <a href="\${result.url}" class="search-result-item">
        <div class="search-result-company">\${result.company}</div>
        <div class="search-result-meta">\${result.category} • \${result.benefit}</div>
      </a>
    \`).join('');

    searchResults.style.display = 'block';
  }, 200);
});

// Close search results when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    searchResults.style.display = 'none';
  }
});

// Show results when focusing input with existing text
searchInput.addEventListener('focus', (e) => {
  if (e.target.value.trim().length >= 2) {
    const results = searchDeals(e.target.value.trim());
    if (results.length > 0) {
      searchResults.style.display = 'block';
    }
  }
});
</script>
</body>
</html>`;

  return minifyHtml(html);
}

// Generate deal card HTML
function getDealCardHtml(deal, pathPrefix = './') {
  const codeDisplay = deal.codeType === 'code' ? `
                <div class="code-box">
                    <div class="code-label">Your Referral Code</div>
                    <div class="code-value">${deal.code}</div>
                </div>` : `
                <div class="code-box">
                    <div class="code-label">Referral Link Required</div>
                    <div class="code-value code-value-small">Click below to apply</div>
                </div>`;

  return `
                <div class="deal-card">
                    <div class="deal-header">
                        <span class="verified-badge">Verified</span>
                        <h3 class="deal-company">${deal.company}</h3>
                        <p class="deal-category"><a href="${pathPrefix}${deal.categorySlug}/index.html">${deal.category}</a></p>
                    </div>
                    <div class="deal-body">
                        <p class="deal-benefit">${deal.benefit}</p>
                        <p class="deal-description">${deal.bodyContent.split('\n\n')[0]}</p>
                        <div class="success-rate">
                            <div class="success-percentage">${deal.successRate}%</div>
                            <div class="success-text">
                                <strong>Success rate</strong><br>
                                Verified working today
                            </div>
                        </div>
${codeDisplay}
                        <a href="${pathPrefix}deal/${deal.slug}/index.html" class="deal-cta">View Full Details →</a>
                    </div>
                </div>`;
}

// Generate structured data for a deal
function getStructuredData(deal) {
  return `
<script type="application/ld+json">
{
"@context": "https://schema.org",
"@type": "Offer",
"name": "${deal.company} Referral Code",
"description": "${deal.benefit}",
"url": "https://referralcode.com/deal/${deal.slug}/",
"seller": {
"@type": "Organization",
"name": "${deal.company}"
},
"priceSpecification": {
"@type": "PriceSpecification",
"price": "0",
"priceCurrency": "USD"
}
}
</script>`;
}

// Generate homepage
function generateHomepage(deals, allDeals) {
  const dealsGridHtml = deals.map(deal => getDealCardHtml(deal)).join('\n');

  const content = `
    <section class="hero">
        <h1>Verified Referral Codes That Actually Work</h1>
        <p class="tagline">No spam. No expired codes. Just real savings.</p>
        <p>We test every code before publishing. You get the benefit, we earn a small commission. It's that simple.</p>

        <div class="trust-bar">
            <div class="trust-item">
                <span class="trust-number">100%</span>
                <span class="trust-label">Success Rate</span>
            </div>
            <div class="trust-item">
                <span class="trust-number">${deals.length}+</span>
                <span class="trust-label">Verified Partners</span>
            </div>
            <div class="trust-item">
                <span class="trust-number">24hrs</span>
                <span class="trust-label">Code Testing</span>
            </div>
        </div>
    </section>

    <section class="top-deals" id="deals">
        <div class="container">
            <div class="section-header">
                <h2>Today's Top Referral Codes</h2>
                <p>Every code verified within the last 24 hours</p>
            </div>

            <div class="deals-grid">
                ${dealsGridHtml}
            </div>
        </div>
    </section>

    <section class="trust-section" id="how-it-works">
        <div class="container">
            <div class="section-header">
                <h2>Why Trust ReferralCode.com?</h2>
                <p>We built this site because we were tired of broken codes and spammy affiliate sites</p>
            </div>

            <div class="trust-grid">
                <div class="trust-card">
                    <div class="trust-icon">✓</div>
                    <h3>100% Verified</h3>
                    <p>Every code is tested within 24 hours. If it doesn't work, we don't list it. Simple as that.</p>
                </div>
                <div class="trust-card">
                    <div class="trust-icon">⚖</div>
                    <h3>Full Transparency</h3>
                    <p>We earn a commission when you use our codes. You get savings, we get a referral fee. Everyone wins.</p>
                </div>
                <div class="trust-card">
                    <div class="trust-icon">🛡</div>
                    <h3>No Spam</h3>
                    <p>No pop-ups. No email collection. No tricks. Just clean, reliable referral codes that benefit you.</p>
                </div>
                <div class="trust-card">
                    <div class="trust-icon">⭐</div>
                    <h3>Quality Over Quantity</h3>
                    <p>We only partner with companies we trust. Every deal here offers genuine value to you.</p>
                </div>
            </div>
        </div>
    </section>
  `;

  return getBaseTemplate({
    title: 'ReferralCode.com - Verified Referral Codes That Work',
    description: 'Find verified referral codes and promo codes that actually work. Every code tested within 24 hours. Earn cash back, bonuses, and discounts from top brands.',
    content,
    canonicalUrl: 'https://referralcode.com/',
    includeSitemapLink: true,
    deals: allDeals
  });
}

// Generate individual deal page
function generateDealPage(deal, relatedDeals, allDeals) {
  const codeDisplay = deal.codeType === 'code' ? `
<div class="code-box-large">
<div class="code-label">Your Referral Code</div>
<div class="code-value">${deal.code}</div>
<button class="copy-button" onclick="navigator.clipboard.writeText('${deal.code}')">Copy Code</button>
</div>` : `
<div class="code-box-large">
<div class="code-label">Referral Link Required</div>
<div class="code-value code-value-small">Use the link below to claim your offer</div>
</div>`;

  const relatedHtml = relatedDeals.length > 0 ? `
<section class="related-deals">
<div class="container">
<h2>More <a href="../../${deal.categorySlug}/index.html">${deal.category}</a> Deals</h2>
<div class="deals-grid">
${relatedDeals.map(d => getDealCardHtml(d, '../../')).join('\n')}
</div>
</div>
</section>` : '';

  const content = `
${getStructuredData(deal)}
<article class="deal-page">
<div class="container">
<div class="deal-page-header">
<a href="../../${deal.categorySlug}/index.html" class="deal-category-badge">${deal.category}</a>
<h1>${deal.company} Referral Code ${CURRENT_YEAR}</h1>
<p class="deal-page-tagline">${deal.benefit}</p>
<div class="verified-banner">
<span class="verified-icon">✓</span>
<span>Verified ${deal.successRate}% Success Rate - Last checked today</span>
</div>
</div>
<div class="deal-page-content">
<div class="deal-main">
${deal.bodyHtml}
${codeDisplay}
<a href="${deal.url}" class="deal-cta-large" target="_blank" rel="noopener">
Claim Your ${deal.benefitAmount} Offer Now →
</a>
<div class="terms-note">
<p><strong>Note:</strong> This is a referral link. We may earn a commission when you sign up, at no extra cost to you. All codes are verified and tested regularly.</p>
</div>
</div>
<aside class="deal-sidebar">
<div class="quick-facts">
<h3>Quick Facts</h3>
<ul>
<li><strong>Company:</strong> ${deal.company}</li>
<li><strong>Category:</strong> <a href="../../${deal.categorySlug}/index.html">${deal.category}</a></li>
<li><strong>Offer:</strong> ${deal.benefit}</li>
${deal.code ? `<li><strong>Code:</strong> ${deal.code}</li>` : ''}
<li><strong>Success Rate:</strong> ${deal.successRate}%</li>
</ul>
</div>
<div class="cta-sidebar">
<a href="${deal.url}" class="deal-cta" target="_blank" rel="noopener">Get Started →</a>
</div>
</aside>
</div>
</div>
</article>
${relatedHtml}`;

  return getBaseTemplate({
    title: deal.metaTitle.replace('2025', CURRENT_YEAR),
    description: deal.metaDescription.replace('2025', CURRENT_YEAR),
    content,
    depth: 2,
    canonicalUrl: `https://referralcode.com/deal/${deal.slug}/`,
    breadcrumbs: [
      { label: 'Home', url: '../../index.html' },
      { label: 'Deals', url: '../../index.html#deals' },
      { label: deal.company, url: `../../deal/${deal.slug}/index.html` }
    ],
    deals: allDeals
  });
}

// Generate category page
function generateCategoryPage(category, allDeals) {
  const dealsGridHtml = category.deals.map(deal => getDealCardHtml(deal, '../')).join('\n');

  // Generate table rows for each deal
  const tableRowsHtml = category.deals.map(deal => {
    const codeDisplay = deal.codeType === 'code'
      ? `<code class="table-code">${deal.code}</code>`
      : `<span class="table-link-required">Link required</span>`;

    // Extract numeric value from benefitAmount (handle both "$100" and "100")
    const numericAmount = typeof deal.benefitAmount === 'string'
      ? parseFloat(deal.benefitAmount.replace(/[^0-9.]/g, ''))
      : deal.benefitAmount;

    return `
                    <tr data-company="${deal.company}" data-amount="${numericAmount}">
                        <td class="table-company">${deal.company}</td>
                        <td class="table-benefit">${deal.benefit}</td>
                        <td class="table-amount">$${numericAmount}</td>
                        <td class="table-code">${codeDisplay}</td>
                        <td class="table-action"><a href="../deal/${deal.slug}/index.html" class="table-cta">View Details</a></td>
                    </tr>`;
  }).join('');

  const blurbHtml = category.blurb ? `<div class="category-blurb">${category.blurb}</div>` : '';
  const defaultDescription = `Find the best verified referral codes and promo codes for ${category.name.toLowerCase()}. All codes tested within 24 hours.`;

  const content = `
<section class="category-page">
<div class="container">
<div class="category-header">
<h1>${category.name} Referral Codes</h1>
<p>${defaultDescription}</p>
${blurbHtml}
<div class="view-controls">
<button class="view-toggle active" data-view="grid">Grid View</button>
<button class="view-toggle" data-view="table">Table View</button>
</div>
</div>
<div class="deals-grid" id="grid-view">
${dealsGridHtml}
</div>
<div class="deals-table-container" id="table-view" style="display: none;">
<div class="table-controls">
<button class="sort-btn active" data-sort="company">Sort A-Z</button>
<button class="sort-btn" data-sort="amount">Sort by Value</button>
</div>
<table class="deals-table">
<thead>
<tr>
<th>Company</th>
<th>Benefit</th>
<th>Value</th>
<th>Code</th>
<th>Action</th>
</tr>
</thead>
<tbody>
${tableRowsHtml}
</tbody>
</table>
</div>
</div>
</section>
<script>
// View toggle functionality
const viewToggles = document.querySelectorAll('.view-toggle');
const gridView = document.getElementById('grid-view');
const tableView = document.getElementById('table-view');

viewToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    viewToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (view === 'grid') {
      gridView.style.display = 'grid';
      tableView.style.display = 'none';
    } else {
      gridView.style.display = 'none';
      tableView.style.display = 'block';
    }
  });
});

// Table sorting functionality
const sortButtons = document.querySelectorAll('.sort-btn');
const tableBody = document.querySelector('.deals-table tbody');
let currentSort = 'company';
let sortAscending = true;

sortButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const sortType = btn.dataset.sort;

    // Toggle sort direction if clicking same button
    if (currentSort === sortType) {
      sortAscending = !sortAscending;
    } else {
      sortAscending = true;
      currentSort = sortType;
    }

    sortButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.textContent = sortType === 'company'
      ? (sortAscending ? 'Sort A-Z' : 'Sort Z-A')
      : (sortAscending ? 'Sort by Value ↑' : 'Sort by Value ↓');

    sortTable(sortType, sortAscending);
  });
});

function sortTable(sortBy, ascending) {
  const rows = Array.from(tableBody.querySelectorAll('tr'));

  rows.sort((a, b) => {
    let aVal, bVal;

    if (sortBy === 'company') {
      aVal = a.dataset.company.toLowerCase();
      bVal = b.dataset.company.toLowerCase();
      return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else {
      aVal = parseFloat(a.dataset.amount);
      bVal = parseFloat(b.dataset.amount);
      return ascending ? bVal - aVal : aVal - bVal; // Higher values first by default
    }
  });

  rows.forEach(row => tableBody.appendChild(row));
}
</script>`;

  return getBaseTemplate({
    title: `${category.name} Referral Codes ${CURRENT_YEAR} - Verified Promo Codes | ReferralCode.com`,
    description: `Find verified ${category.name.toLowerCase()} referral codes and promo codes. ${category.deals.length} working codes tested today. Save money with trusted offers.`,
    content,
    depth: 1,
    canonicalUrl: `https://referralcode.com/${category.slug}/`,
    breadcrumbs: [
      { label: 'Home', url: '../index.html' },
      { label: 'Categories', url: '../index.html#deals' },
      { label: category.name, url: `../${category.slug}/index.html` }
    ],
    deals: allDeals
  });
}

// Generate sitemap
function generateSitemap(deals, categories) {
  const urls = [
    { loc: 'https://referralcode.com/', priority: '1.0' },
    ...deals.map(deal => ({
      loc: `https://referralcode.com/deal/${deal.slug}/`,
      priority: '0.8'
    })),
    ...categories.map(cat => ({
      loc: `https://referralcode.com/${cat.slug}/`,
      priority: '0.7'
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `<url>
<loc>${url.loc}</loc>
<changefreq>daily</changefreq>
<priority>${url.priority}</priority>
</url>`).join('\n')}
</urlset>`;
}

// Main build function
function build() {
  console.log('🔨 Building site...\n');

  // Load deals
  console.log('📖 Loading deals...');
  const deals = loadDeals();
  console.log(`   Found ${deals.length} deals\n`);

  // Get categories
  const categories = getCategories(deals);
  console.log(`📁 Found ${categories.length} categories\n`);

  // Generate homepage
  console.log('🏠 Generating homepage...');
  const homepage = generateHomepage(deals, deals);
  fs.writeFileSync(path.join(__dirname, 'index.html'), homepage);
  console.log('   ✓ index.html\n');

  // Generate deal pages
  console.log('📄 Generating deal pages...');
  const dealDir = path.join(__dirname, 'deal');
  if (!fs.existsSync(dealDir)) {
    fs.mkdirSync(dealDir, { recursive: true });
  }

  deals.forEach(deal => {
    const dealSlugDir = path.join(dealDir, deal.slug);
    if (!fs.existsSync(dealSlugDir)) {
      fs.mkdirSync(dealSlugDir, { recursive: true });
    }

    // Get related deals from same category
    const relatedDeals = deals
      .filter(d => d.categorySlug === deal.categorySlug && d.slug !== deal.slug)
      .slice(0, 3);

    const dealPage = generateDealPage(deal, relatedDeals, deals);
    fs.writeFileSync(path.join(dealSlugDir, 'index.html'), dealPage);
    console.log(`   ✓ deal/${deal.slug}/index.html`);
  });
  console.log('');

  // Generate category pages
  console.log('📁 Generating category pages...');
  categories.forEach(category => {
    const categoryDir = path.join(__dirname, category.slug);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }

    const categoryPage = generateCategoryPage(category, deals);
    fs.writeFileSync(path.join(categoryDir, 'index.html'), categoryPage);
    console.log(`   ✓ ${category.slug}/index.html`);
  });
  console.log('');

  // Generate sitemap
  console.log('🗺️  Generating sitemap...');
  const sitemap = generateSitemap(deals, categories);
  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
  console.log('   ✓ sitemap.xml\n');

  // Generate robots.txt
  console.log('🤖 Generating robots.txt...');
  const robots = `User-agent: *
Allow: /
Disallow: /_data/
Disallow: /*.md
Disallow: /node_modules/
Disallow: /.git/
Disallow: /build.js

Sitemap: https://referralcode.com/sitemap.xml`;
  fs.writeFileSync(path.join(__dirname, 'robots.txt'), robots);
  console.log('   ✓ robots.txt\n');

  console.log('✅ Build complete!\n');
  console.log(`Generated ${deals.length} deal pages, ${categories.length} category pages, and homepage.`);
}

// Run build
build();
