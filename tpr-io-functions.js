/*********************************************************
  TPR/I&O RECORD CRUD FUNCTIONS
**********************************************************/
let currentTprIoIndex = null;

function openTprIoForm() {
  document.getElementById('tprIoIndex').value = '';
  document.getElementById('tprIoDate').value = '';
  document.getElementById('tprIoTime').value = '';
  document.getElementById('tprIoTemp').value = '';
  document.getElementById('tprIoPulse').value = '';
  document.getElementById('tprIoRespRate').value = '';
  document.getElementById('tprIoBp').value = '';
  document.getElementById('tprIoO2Sat').value = '';
  document.getElementById('tprIoIntake').value = '0';
  document.getElementById('tprIoOutput').value = '0';
  document.getElementById('tprIoNotes').value = '';

  // Enable all fields
  enableTprIoFields(true);

  document.getElementById('tprIoSaveBtn').style.display = 'inline-block';
  document.getElementById('tprIoDeleteBtn').style.display = 'none';

  // Show the modal
  const tprIoModal = new bootstrap.Modal(document.getElementById('tprIoModal'));
  tprIoModal.show();
}

function enableTprIoFields(enable) {
  document.getElementById('tprIoDate').disabled = !enable;
  document.getElementById('tprIoTime').disabled = !enable;
  document.getElementById('tprIoTemp').disabled = !enable;
  document.getElementById('tprIoPulse').disabled = !enable;
  document.getElementById('tprIoRespRate').disabled = !enable;
  document.getElementById('tprIoBp').disabled = !enable;
  document.getElementById('tprIoO2Sat').disabled = !enable;
  document.getElementById('tprIoIntake').disabled = !enable;
  document.getElementById('tprIoOutput').disabled = !enable;
  document.getElementById('tprIoNotes').disabled = !enable;
}

function loadTprIoTable() {
  // Check if the TPR/I&O tab is currently active or if we're in a modal operation
  const isTprTabActive = document.querySelector('#tprIoTab.active') !== null ||
                         document.querySelector('a[href="#tprIoTab"].active') !== null;
  const isModalOperation = document.getElementById('tprIoModal').classList.contains('show');

  // Only load data if the tab is active or we're in a modal operation (add/edit/delete)
  if (!isTprTabActive && !isModalOperation) {
    console.log('TPR/I&O tab not active, skipping data load');
    return;
  }

  console.log('Loading TPR/I&O data');
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);

  if (!patient) {
    document.getElementById('tprIoTableBody').innerHTML = '';
    return;
  }

  if (!patient.tprIoRecords) {
    patient.tprIoRecords = [];
  }

  let tableContent = '';
  patient.tprIoRecords.forEach((record, index) => {
    const dateTime = `${record.date || 'N/A'} ${record.time || ''}`;
    const vitals = `Temp: ${record.temp || '-'}°C, PR: ${record.pulse || '-'}, RR: ${record.respRate || '-'}`;
    const bp = `BP: ${record.bp || '-'}, O2: ${record.o2sat || '-'}%`;
    const io = `I: ${record.intake || '0'} / O: ${record.output || '0'} ml`;

    tableContent += `
      <tr>
        <td class="align-middle">${dateTime}</td>
        <td class="align-middle">
          <div>${vitals}</div>
          <div>${bp}</div>
          <div>${io}</div>
          <div class="text-muted">${record.notes || ''}</div>
        </td>
        <td class="text-end">
          ${createActionButton('view', `viewTprIoRecord(${index})`)}
          ${createActionButton('edit', `editTprIoRecord(${index})`)}
          ${createActionButton('delete', `deleteTprIoRecord(${index})`)}
        </td>
      </tr>
    `;
  });

  const tableBody = document.getElementById('tprIoTableBody');
  if (tableBody) {
    tableBody.innerHTML = tableContent;
  }

  // Show/hide empty state message
  const emptyMessage = document.getElementById('emptyTprIo');
  if (emptyMessage) {
    emptyMessage.style.display = patient.tprIoRecords.length === 0 ? 'block' : 'none';
  }
}

function saveTprIoRecord() {
  const index = document.getElementById('tprIoIndex').value;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);

  if (!patient) {
    showAlert('Patient not found', 'error');
    return;
  }

  if (!patient.tprIoRecords) {
    patient.tprIoRecords = [];
  }

  const record = {
    date: document.getElementById('tprIoDate').value,
    time: document.getElementById('tprIoTime').value,
    temp: document.getElementById('tprIoTemp').value,
    pulse: document.getElementById('tprIoPulse').value,
    respRate: document.getElementById('tprIoRespRate').value,
    bp: document.getElementById('tprIoBp').value,
    o2sat: document.getElementById('tprIoO2Sat').value,
    intake: document.getElementById('tprIoIntake').value,
    output: document.getElementById('tprIoOutput').value,
    notes: document.getElementById('tprIoNotes').value,
    timestamp: new Date().toISOString()
  };

  try {
    if (index === '') {
      patient.tprIoRecords.push(record);
    } else {
      patient.tprIoRecords[parseInt(index)] = record;
    }

    savePatients(patients).then(() => {
      loadTprIoTable();
      const modal = bootstrap.Modal.getInstance(document.getElementById('tprIoModal'));
      if (modal) modal.hide();
      showAlert('TPR/I&O record saved successfully!', 'success');
    }).catch(error => {
      console.error('Error saving TPR/I&O record:', error);
      showAlert('Error saving TPR/I&O record: ' + error.message, 'error');
    });
  } catch (error) {
    console.error('Error in saveTprIoRecord:', error);
    showAlert('Error in TPR/I&O record: ' + error.message, 'error');
  }
}

function viewTprIoRecord(index) {
  try {
    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);

    if (!patient || !patient.tprIoRecords) {
      showAlert('TPR/I&O record not found', 'error');
      return;
    }

    const record = patient.tprIoRecords[index];
    if (!record) {
      showAlert('TPR/I&O record not found', 'error');
      return;
    }

    document.getElementById('tprIoIndex').value = index;

    // Set values
    document.getElementById('tprIoDate').value = record.date || '';
    document.getElementById('tprIoTime').value = record.time || '';
    document.getElementById('tprIoTemp').value = record.temp || '';
    document.getElementById('tprIoPulse').value = record.pulse || '';
    document.getElementById('tprIoRespRate').value = record.respRate || '';
    document.getElementById('tprIoBp').value = record.bp || '';
    document.getElementById('tprIoO2Sat').value = record.o2sat || '';
    document.getElementById('tprIoIntake').value = record.intake || '0';
    document.getElementById('tprIoOutput').value = record.output || '0';
    document.getElementById('tprIoNotes').value = record.notes || '';

    // Disable all fields
    enableTprIoFields(false);

    // Update button visibility
    document.getElementById('tprIoSaveBtn').style.display = 'none';
    document.getElementById('tprIoDeleteBtn').style.display = 'inline-block';

    // Show modal using Bootstrap
    const tprIoModal = new bootstrap.Modal(document.getElementById('tprIoModal'));
    tprIoModal.show();
  } catch (error) {
    console.error('Error viewing TPR/I&O record:', error);
    showAlert('Error viewing TPR/I&O record: ' + error.message, 'error');
  }
}

function editTprIoRecord(index) {
  try {
    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);

    if (!patient || !patient.tprIoRecords) {
      showAlert('TPR/I&O record not found', 'error');
      return;
    }

    // First view the record to populate all fields
    viewTprIoRecord(index);

    // Then enable all fields for editing
    enableTprIoFields(true);

    // Show the save button
    document.getElementById('tprIoSaveBtn').style.display = 'inline-block';
    document.getElementById('tprIoDeleteBtn').style.display = 'inline-block';
  } catch (error) {
    console.error('Error editing TPR/I&O record:', error);
    showAlert('Error editing TPR/I&O record: ' + error.message, 'error');
  }
}

function deleteTprIoRecord(index) {
  // If index is not provided, get it from the hidden input field
  if (index === undefined) {
    index = document.getElementById('tprIoIndex').value;
    if (!index) {
      showAlert('No record selected to delete', 'error');
      return;
    }
    index = parseInt(index);
  }

  if (!confirm('Are you sure you want to delete this TPR/I&O record?')) return;

  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);

  if (!patient || !patient.tprIoRecords) {
    showAlert('TPR/I&O record not found', 'error');
    return;
  }

  patient.tprIoRecords.splice(index, 1);
  savePatients(patients).then(() => {
    loadTprIoTable();
    const modal = bootstrap.Modal.getInstance(document.getElementById('tprIoModal'));
    if (modal) modal.hide();
    showAlert('TPR/I&O record deleted successfully!', 'success');
  });
}
