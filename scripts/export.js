;(function () {
  'use strict'

  console.log('[DNS Export] Script loaded')

  // Prevent duplicate script execution
  if (window.__dnsExportInitialized) return
  window.__dnsExportInitialized = true

  console.log('[DNS Export] Initializing...')

  let observer = null
  let lastUrl = location.href

  // Main initialization
  function init() {
    // setupUrlChangeDetection()
    setupDomObserver()
    // Immediate check
    tryInjectButton()
  }

  // // Detect SPA navigation via History API
  // function setupUrlChangeDetection() {
  //   const handleUrlChange = () => {
  //     if (location.href !== lastUrl) {
  //       lastUrl = location.href
  //       console.log('[DNS Export] URL changed:', location.href)
  //       tryInjectButton()
  //     }
  //   }

  //   // Monkey-patch History API
  //   const originalPushState = history.pushState
  //   const originalReplaceState = history.replaceState

  //   history.pushState = function (...args) {
  //     originalPushState.apply(this, args)
  //     handleUrlChange()
  //   }

  //   history.replaceState = function (...args) {
  //     originalReplaceState.apply(this, args)
  //     handleUrlChange()
  //   }

  //   window.addEventListener('popstate', handleUrlChange)
  // }

  // MutationObserver for DOM changes
  function setupDomObserver() {
    if (observer) observer.disconnect()

    observer = new MutationObserver(() => {
      // Debounce: only check once per animation frame
      if (!observer.pending) {
        observer.pending = true
        requestAnimationFrame(() => {
          observer.pending = false
          tryInjectButton()
        })
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  function tryInjectButton() {
    const table = document.querySelector('[class*="TableRoot-"]')

    // Exit if no table or button already exists
    if (!table || document.getElementById('downloadDnsRecords')) {
      return
    }

    // exit if url does not end with /dns
    if (!location.href.endsWith('/dns')) {
      console.log('[DNS Export] Not on DNS page, skipping button injection')
      return
    }

    console.log('[DNS Export] Table found, injecting button')
    createButton(table)
  }

  function createButton(table) {
    // find "Add Record" button and grab classes
    // search for button with innerText "Add Record"
    const addRecordButton = Array.from(
      document.querySelectorAll('button')
    ).find((el) => el.innerText.trim().toLowerCase() === 'add record')
    const dnsRecordsHeading = Array.from(document.querySelectorAll('h4')).find(
      (el) => el.innerText.trim() === 'DNS Records'
    )
    let classes = []
    if (!addRecordButton && !dnsRecordsHeading) {
      console.log(
        '[DNS Export] Neither "Add Record" button nor "DNS Records" heading found'
      )
      return
    }
    if (addRecordButton) {
      classes = Array.from(addRecordButton.classList)
    }

    // setup button with id downloadDnsRecords
    const button = document.createElement('button')
    button.id = 'downloadDnsRecords'
    button.innerHTML = 'Export Records'
    button.onclick = downloadTableAsCsv
    button.style.marginLeft = '8px'
    // add classes from add record button
    classes.forEach((cls) => {
      button.classList.add(cls)
    })

    // add button
    if (addRecordButton) {
      addRecordButton.parentNode.insertBefore(button, addRecordButton.nextSibling)
      return
    }

    dnsRecordsHeading.insertAdjacentElement('afterend', button)
  }

  // Column headers we know how to read. Matched case-insensitively against
  // the table header text so the export survives columns being added/reordered.
  const COLUMN_ALIASES = {
    type: ['record name', 'record type', 'type'],
    host: ['sub domain', 'subdomain', 'host', 'hostname', 'name'],
    ttl: ['ttl'],
    value: ['record information', 'record info', 'value', 'address', 'content']
  }
  // Used when no header row can be found (older UI)
  const DEFAULT_COLUMNS = { type: 0, host: 1, value: 2 }

  function cellsOf(row) {
    let cells = row.querySelectorAll('[class*="Table__Cell-"]')
    if (cells.length === 0) cells = row.querySelectorAll('[class*="Cell__CellEl-"]')
    return Array.from(cells)
  }

  // Build { type, host, ttl, value } -> cell index from the header row
  function detectColumns() {
    const header = document.querySelector('[class*="TableRoot-"] [class*="Table__Header-"]')
    if (!header) {
      console.log('[DNS Export] No header row found, using default columns')
      return { columns: { ...DEFAULT_COLUMNS }, headers: null }
    }
    const headers = cellsOf(header).map((c) => c.innerText.trim().toLowerCase())
    const columns = {}
    Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => {
      const idx = headers.findIndex((h) => aliases.includes(h))
      if (idx !== -1) columns[key] = idx
    })
    return { columns, headers }
  }

  // Sanity check the mapping against the first data row and let the user
  // confirm before exporting if anything looks off.
  function confirmColumns(columns, headers, firstRow) {
    const problems = []
    ;['type', 'host', 'value'].forEach((key) => {
      if (columns[key] === undefined) problems.push(`Could not find the "${key}" column`)
    })

    if (problems.length === 0 && firstRow) {
      const cells = cellsOf(firstRow)
      const type = (cells[columns.type]?.innerText || '').trim()
      const value = (cells[columns.value]?.innerText || '').trim()
      if (!/^[A-Z]+( RECORD)?$/i.test(type))
        problems.push(`Type column reads "${type}", expected e.g. "A Record"`)
      if (/^\d+$/.test(value))
        problems.push(`Value column reads "${value}", looks like a TTL not a record value`)
    }

    const summary = Object.entries(columns)
      .map(([k, i]) => `${k} -> column ${i + 1}${headers ? ` (${headers[i]})` : ''}`)
      .join('\n')
    console.log('[DNS Export] Column mapping:\n' + summary)

    if (problems.length === 0) return true
    return confirm(
      'DNS Export: the table layout may have changed.\n\n' +
        problems.join('\n') +
        '\n\nDetected columns:\n' +
        (summary || '(none)') +
        (headers ? '\n\nHeaders on page: ' + headers.join(' | ') : '') +
        '\n\nExport anyway?'
    )
  }

  // Work out the apex domain: the host with the fewest labels that every
  // other host sits under (falls back to the shortest host).
  function detectDomain(hosts) {
    const clean = hosts.map((h) => h.replace(/\.$/, '')).filter(Boolean)
    if (clean.length === 0) return ''
    const sorted = [...clean].sort(
      (a, b) => a.split('.').length - b.split('.').length || a.length - b.length
    )
    const apex = sorted.find((cand) =>
      clean.every((h) => h === cand || h.endsWith('.' + cand))
    )
    return apex || sorted[0]
  }

  function relativeHost(host, domain) {
    if (!domain) return host
    if (host === domain) return '@'
    if (host.endsWith('.' + domain)) return host.slice(0, -(domain.length + 1))
    return host
  }

  // function to download the table as csv
  function downloadTableAsCsv() {
    const records = Array.from(
      document.querySelectorAll('[class*="TableRoot-"] [class*="Table__Row-"]')
    )

    const { columns, headers } = detectColumns()
    if (!confirmColumns(columns, headers, records[0])) return
    if (['type', 'host', 'value'].some((k) => columns[k] === undefined)) {
      alert('DNS Export: cannot export without type, host and value columns.')
      return
    }

    const domain = detectDomain(
      records
        .map((r) => cellsOf(r)[columns.host])
        .filter(Boolean)
        .map((c) => c.innerText.trim())
    )
    let output = domain ? `$ORIGIN ${domain}.\n` : ''

    // The page groups records by type and only labels the first row of
    // each group, so carry the last seen type forward.
    let lastType = ''
    records.forEach((record) => {
      const cells = cellsOf(record)
      if (cells.length <= columns.value) return

      let type = cells[columns.type].innerText.trim().toUpperCase().replace(' RECORD', '')
      if (!type) type = lastType
      if (!type) return
      lastType = type

      const host = cells[columns.host].innerText.trim()
      if (!host) return

      // use the page's TTL when present, otherwise default to 3600
      let ttl = 3600
      if (columns.ttl !== undefined && cells[columns.ttl]) {
        const t = parseInt(cells[columns.ttl].innerText.trim(), 10)
        if (!isNaN(t) && t > 0) ttl = t
      }

      // get address values
      let address = ''
      const values = cells[columns.value].innerText
        .trim()
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
      if (values.length === 0) return
      values.forEach((value) => {
        // skip labels like "IP Address:", "Hostname:", "Priority:", etc.
        if (value.endsWith(':')) return
        // quote (and escape) txt record values
        address +=
          type === 'TXT' ? `   "${value.replace(/"/g, '\\"')}"` : `   ${value}`
      })

      // hostname targets must be fully qualified
      if (
        (type === 'CNAME' || type === 'MX' || type === 'SRV' || type === 'NS') &&
        !address.endsWith('.')
      ) {
        address += '.'
      }

      output += `${relativeHost(host, domain)}   ${ttl}  IN   ${type}${address}\n`
    })
    console.log(output)

    const link = document.createElement('a')
    link.setAttribute('download', `${domain || 'dns'}.crazydomains.txt`)
    link.setAttribute(
      'href',
      'data:text/plain;charset=UTF-8,' + encodeURIComponent(output)
    )
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
