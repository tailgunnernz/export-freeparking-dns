window.fpLoaded = 0;
waitForElement('#dns_records_block', createButton);

// function to wait till the table is loaded
function waitForElement(selector, callback) {
  if (window.fpLoaded > 10) {
    console.log('timeout');
    return;
  }
  window.fpLoaded++;

  const table = document.querySelector(selector);
  if (table) {
    console.log('table loaded');
    callback(table);
  } else {
    console.log('table not loaded');
    setTimeout(() => {
      waitForElement(selector, callback);
    }, 100);
  }
}

function createButton(table) {
  // setup button with id downloadDnsRecords
  const button = document.createElement('button');
  button.id = 'downloadDnsRecords';
  button.innerHTML = 'Download DNS Records';
  button.classList.add('memberBtnGreen');
  button.onclick = downloadTableAsCsv;

  // add button after first child of table
  table.insertBefore(button, table.firstChild);
}

// function to download the table as csv
function downloadTableAsCsv() {
  let output = '';
  let firstA = true;
  let domain = '';
  const records = document.querySelectorAll('.record_block');
  // ieration through the records
  records.forEach((record) => {
    const row = record.querySelector('.dnsRow');
    if (!row) return;

    let type = '';
    if (row.classList.contains('a_records')) {
      type = 'A';
    } else if (row.classList.contains('cname_records')) {
      type = 'CNAME';
    } else if (row.classList.contains('mx_records')) {
      type = 'MX';
    } else if (row.classList.contains('txt_records')) {
      type = 'TXT';
    } else if (row.classList.contains('srv_records')) {
      type = 'SRV';
    } else if (row.classList.contains('soa_records')) {
      type = 'SOA';
    }
    if (!type) return;

    let host = row.querySelector('.record');
    if (!host) return;
    host = host.textContent.trim();

    let address = '';
    const values = row.querySelectorAll('.address > span');
    if (!values) return;
    values.forEach((value) => {
      // add quotes if it's a txt record
      address +=
        type === 'TXT'
          ? `   "${value.textContent.trim()}"`
          : `   ${value.textContent.trim()}`;
    });

    if (type === 'A' && firstA) {
      domain = host;
      firstA = false;
      output += `$ORIGIN ${domain}.\n`;
    }

    // replace .domain.com with ''
    if (type !== 'SRV') host = host.replace(`.${domain}`, '');
    // replace domain.com with @
    host = host.replace(domain, '@');

    // add output
    output += `${host}   3600  IN   ${type}${address}\n`;
  });
  console.log(output);

  const link = document.createElement('a');
  link.setAttribute('download', `${domain}.freeparking.txt`);
  link.append('Download!');
  link.setAttribute(
    'href',
    'data:text/plain;charset=UTF-8,' + encodeURI(output)
  );

  document.body.appendChild(link);
  link.click();
}
