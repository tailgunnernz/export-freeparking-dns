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
    let classes = []
    if (!addRecordButton) {
      console.log(
        '[DNS Export] "Add Record" button not found, DNS table not available'
      )
      return
    }
    classes = Array.from(addRecordButton.classList)

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
    addRecordButton.parentNode.insertBefore(button, addRecordButton.nextSibling)
  }

  // function to download the table as csv
  function downloadTableAsCsv() {
    let output = ''
    let firstA = true
    let domain = ''
    const records = document.querySelectorAll(
      '[class*="TableRoot-"] [class*="Table__Row-"]'
    )
    // ieration through the records
    records.forEach((record) => {
      const details = record.innerText.trim().split('\n')
      if (details.length === 0) return

      // first item is the record type
      const type = details[0].trim().toUpperCase().replace(' RECORD', '')
      if (!type) return

      // second item is the host
      let host = details[1] ? details[1].trim() : ''
      if (!host) return

      // get address values
      let address = ''
      const values = details.slice(2)
      if (!values) return
      values.forEach((value) => {
        const trimmed = value.trim()
        if (
          !trimmed ||
          trimmed === 'IP Address:' ||
          trimmed === 'Hostname:' ||
          trimmed === 'Priority:' ||
          trimmed === 'Content:'
        )
          return
        // add quotes if it's a txt record
        address += type === 'TXT' ? `   "${trimmed}"` : `   ${trimmed}`
      })

      if (type === 'CNAME' || type === 'MX' || type === 'SRV') {
        address += '.'
      }

      if (type === 'A' && firstA) {
        domain = host
        firstA = false
        output += `$ORIGIN ${domain}.\n`
      }

      // replace .domain.com with ''
      if (type !== 'SRV') host = host.replace(`.${domain}`, '')
      // replace domain.com with @
      host = host.replace(domain, '@')

      // add output
      output += `${host}   3600  IN   ${type}${address}\n`
    })
    console.log(output)

    const link = document.createElement('a')
    link.setAttribute('download', `${domain}.crazydomains.txt`)
    link.append('Download!')
    link.setAttribute(
      'href',
      'data:text/plain;charset=UTF-8,' + encodeURI(output)
    )

    document.body.appendChild(link)
    link.click()
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
