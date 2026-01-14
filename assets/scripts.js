/*********************************************************
  SETUP INDEXEDDB USING DEXIE
**********************************************************/
const db = new Dexie("ehrDB");

// Function to handle database initialization with version management
async function initializeDatabase() {
  try {
    // First, try to open the database without specifying a version
    // to check what version currently exists
    const tempDb = new Dexie("ehrDB");
    await tempDb.open();
    const currentVersion = tempDb.verno;
    tempDb.close();

    // Use a version higher than any existing version
    // If current version is detected, use a higher one
    // Otherwise use our default version
    const newVersion = currentVersion ? (currentVersion + 1) : 100000000000000;

    // Now initialize with the proper version
    db.version(newVersion).stores({
      patients: "++id, patientId, name, birthdate, gender, age, admissionNo, dateTime, roomNo, station, status, medicalRecords, medicationRecords, historyRecords, nursingRecords, payBillsRecords, appointmentRecords, diagnosisRecords, treatmentRecords, tprIoRecords, planningRecords, reconciliationRecords, marRecords, cdssAlertsRecords, dosingAlertsRecords, pediatricAlertsRecords, nursingHistoryRecords"
    });

    // Open the database with the new version
    await db.open();
    console.log("Database initialized successfully with version:", newVersion);
  } catch (error) {
    console.error("Error initializing database:", error);

    // Fallback: If we can't detect the version, use a very high version number
    // that's likely higher than any existing version
    db.version(100000000000000).stores({
      patients: "++id, patientId, name, birthdate, gender, age, admissionNo, dateTime, roomNo, station, status, medicalRecords, medicationRecords, historyRecords, nursingRecords, payBillsRecords, appointmentRecords, diagnosisRecords, treatmentRecords, tprIoRecords, planningRecords, reconciliationRecords, marRecords, cdssAlertsRecords, dosingAlertsRecords, pediatricAlertsRecords, nursingHistoryRecords"
    });

    try {
      await db.open();
      console.log("Database initialized with fallback version");
    } catch (fallbackError) {
      console.error("Critical database error:", fallbackError);
      alert("There was a problem initializing the database. Please clear your browser data and try again.");
    }
  }
}

// Function to show the database reset confirmation modal
function resetDatabase() {
  // Show the confirmation modal
  const modal = new bootstrap.Modal(document.getElementById('resetDatabaseModal'));
  modal.show();
}

// Function to actually delete the database after confirmation
async function confirmResetDatabase() {
  try {
    // Hide the modal
    bootstrap.Modal.getInstance(document.getElementById('resetDatabaseModal')).hide();

    // Show a loading indicator
    showLoader();

    // Close the current database if it's open
    if (db.isOpen()) {
      db.close();
    }

    // Delete the database
    await Dexie.delete("ehrDB");
    console.log("Database deleted successfully");

    // Reinitialize with a clean slate
    await initializeDatabase();

    // Clear the cache and reload the UI
    patientsCache = [];
    loadPatients();

    // Hide the loader
    hideLoader();

    showAlert("Database has been reset successfully. The page will reload.", "success");

    // Reload the page after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (error) {
    console.error("Error resetting database:", error);
    hideLoader();
    showAlert("There was a problem resetting the database. Please try clearing your browser data manually.", "error");
  }
}

// Initialize the database
initializeDatabase();


/*********************************************************
  GLOBAL VARIABLES
**********************************************************/
let currentPatientIndex = null; // index in the local patientsCache array
let currentTestType = null;
let currentTestIndex = null;
let currentMedicationIndex = null;
let currentHistoryIndex = null;
let currentNursingIndex = null;
let currentPayBillsIndex = null;
let currentAppointmentIndex = null;
let currentDiagnosisIndex = null;
let currentTreatmentIndex = null;
let currentPlanningIndex = null;
let currentReconciliationIndex = null;
let currentMARIndex = null;
let currentUploadImages = []; // Array of objects: { src: <dataURL>, note: "" }

let currentPage = 1;
const itemsPerPage = 5;
let patientsCache = []; // Local cache loaded from IndexedDB
let dismissedAlerts = [];
let alertsPage = 1;
const alertsPerPage = 7;

/*********************************************************
  HELPER FUNCTIONS
**********************************************************/
// Load all patients from IndexedDB into the cache.
async function loadPatientsFromDB() {
  try {
    // Make sure the database is open and ready
    if (!db.isOpen()) {
      await initializeDatabase();
    }

    patientsCache = await db.patients.toArray();
    return patientsCache;
  } catch (error) {
    console.error("Error loading patients from database:", error);

    // Try to reinitialize the database if there was an error
    try {
      await initializeDatabase();
      patientsCache = await db.patients.toArray();
      return patientsCache;
    } catch (fallbackError) {
      console.error("Critical error loading patients:", fallbackError);
      showAlert("There was a problem loading patient data. Please refresh the page.", "error");
      return [];
    }
  }
}

// Synchronous getter: returns the cached patients.
function getPatients() {
  return patientsCache;
}

// Save the entire patientsCache back to IndexedDB using bulkPut.
async function savePatients(patients) {
  try {
    // Make sure the database is open and ready
    if (!db.isOpen()) {
      await initializeDatabase();
    }

    await db.patients.bulkPut(patients);
    patientsCache = await db.patients.toArray();
  } catch (error) {
    console.error("Error saving patients to database:", error);

    // Try to reinitialize the database if there was an error
    try {
      await initializeDatabase();
      await db.patients.bulkPut(patients);
      patientsCache = await db.patients.toArray();
    } catch (fallbackError) {
      console.error("Critical error saving patients:", fallbackError);
      showAlert("There was a problem saving patient data. Please refresh the page and try again.", "error");
    }
  }
}

// Reset global indices and the image upload array.
function resetGlobalRecordIndices() {
  currentTestIndex = null;
  currentMedicationIndex = null;
  currentHistoryIndex = null;
  currentNursingIndex = null;
  currentPayBillsIndex = null;
  currentAppointmentIndex = null;
  currentDiagnosisIndex = null;
  currentTreatmentIndex = null;
  currentPlanningIndex = null;
  currentReconciliationIndex = null;
  currentMARIndex = null;
  currentUploadImages = [];
}

// Truncate text for table display.
function truncateText(text, maxLength) {
  if (!text) return "";
  return text.length <= maxLength ? text : text.substring(0, maxLength) + "...";
}

/**
 * Creates consistent action buttons (View, Edit, Delete) with icons
 * @param {string} action - The action type: 'view', 'edit', or 'delete'
 * @param {string} functionCall - The JavaScript function to call with index parameter
 * @param {boolean} showText - Whether to show the button text (default: true)
 * @returns {string} HTML string for the button
 */
function createActionButton(action, functionCall, showText = true) {
  let icon, text, btnClass;

  switch(action.toLowerCase()) {
    case 'view':
      icon = 'bi-eye-fill';
      text = 'View';
      btnClass = 'btn-view';
      break;
    case 'edit':
      icon = 'bi-pencil-fill';
      text = 'Edit';
      btnClass = 'btn-edit';
      break;
    case 'delete':
      icon = 'bi-trash-fill';
      text = 'Delete';
      btnClass = 'btn-delete';
      break;
    default:
      icon = 'bi-gear-fill';
      text = action;
      btnClass = 'btn-secondary';
  }

  return `<button class="btn btn-sm action-btn ${btnClass}" onclick="${functionCall}">
    <i class="bi ${icon}"></i>${showText ? ' ' + text : ''}
  </button>`;
}

/*********************************************************
  LOGIN FUNCTIONALITY
**********************************************************/
// Function to show login page
function showLoginPage() {
    const landingPage = document.getElementById('landingPage');
    const loginPage = document.getElementById('loginPage');

    if (landingPage && loginPage) {
        landingPage.style.display = 'none';
        loginPage.style.display = 'flex';
    }
}

// Login Form Handler
document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    if (email === "grp1sec201@feu.edu.ph" && password === "123") {
        showAlert("Login successful!", "success");
        showLoader();
        setTimeout(async () => {
            hideLoader();
            document.getElementById("loginPage").style.display = "none";
            const mainContent = document.getElementById("mainContent");
            mainContent.style.display = "block";
            await loadPatientsFromDB();  // patientsCache is loaded here

            // Fix all practice alert indicators
            await fixAllPracticeAlertIndicators();

            loadPatients();
            loadNotifications(); // Build notifications immediately
        }, 2000);
    } else {
        showAlert("Invalid email or password!", "error");
    }
});

function logout() {
    document.getElementById("loginForm").reset();
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("loginPage").style.display = "flex";
    // Use a short delay to ensure the login page is visible before focusing the email field
    setTimeout(() => {
        document.getElementById("loginEmail").focus();
    }, 100);
}

function showLoader() {
    const loader = document.getElementById("loadingScreen");
    loader.style.display = "flex";
    void loader.offsetWidth;
    loader.classList.add("visible");
    setTimeout(hideLoader, 3000);
}

function hideLoader() {
    const loader = document.getElementById("loadingScreen");
    loader.classList.remove("visible");
    setTimeout(() => {
        loader.style.display = "none";
    }, 1000);
}

/*********************************************************
  PATIENT CRUD & LISTING
**********************************************************/
async function loadPatients() {
  const allPatients = getPatients();
  populatePatientTablePaginated(allPatients);
  document.getElementById("emptyPatientMessage").style.display =
    allPatients.length === 0 ? "block" : "none";
}

function populatePatientTablePaginated(patientsArray) {
  const tableBody = document.getElementById("patientTableBody");
  tableBody.innerHTML = "";
  const totalItems = patientsArray.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentSlice = patientsArray.slice(startIndex, startIndex + itemsPerPage);
  currentSlice.forEach((patient, i) => {
    const realIndex = startIndex + i;
    tableBody.innerHTML += `
      <tr>
        <td>${patient.patientId}</td>
        <td>${patient.name}</td>
        <td>${patient.birthdate}</td>
        <td>${patient.gender}</td>
        <td>${patient.age}</td>
        <td>${patient.admissionNo}</td>
        <td>${patient.dateTime}</td>
        <td>${patient.roomNo}</td>
        <td>${patient.station}</td>
        <td>${patient.status}</td>
        <td>
       <button class="btn btn-info btn-sm"
        style="background-color: #5a87c2; border: none; color: white;"
        onclick="viewPatient(${patient.id})">
  View
</button>

<button class="btn btn-warning btn-sm"
        style="background-color: #f0ad4e; border: none; color: white;"
        onclick="openEditPatientForm(${patient.id})">
  Edit
</button>

<button class="btn btn-danger btn-sm"
        style="background-color: #d9534f; border: none; color: white;"
        onclick="deletePatient(${patient.id})">
  Delete
</button>

        </td>
      </tr>`;
  });
  buildPaginationUI(totalPages);
}

function buildPaginationUI(totalPages) {
  const paginationUl = document.getElementById("paginationUl");
  paginationUl.innerHTML = "";
  const prevLi = document.createElement("li");
  prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  prevLi.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${currentPage - 1})">&laquo;</a>`;
  paginationUl.appendChild(prevLi);
  for (let i = 1; i <= totalPages; i++) {
    const li = document.createElement("li");
    li.className = "page-item" + (i === currentPage ? " active" : "");
    li.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${i})">${i}</a>`;
    paginationUl.appendChild(li);
  }
  const nextLi = document.createElement("li");
  nextLi.className = `page-item ${currentPage === totalPages || totalPages === 0 ? "disabled" : ""}`;
  nextLi.innerHTML = `<a class="page-link" href="#" onclick="goToPage(${currentPage + 1})">&raquo;</a>`;
  paginationUl.appendChild(nextLi);
}

function goToPage(pageNumber) {
  currentPage = pageNumber;
  loadPatients();
}

function filterPatients() {
  const filterBy = document.getElementById("searchFilter").value;
  const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
  const allPatients = getPatients();
  const filtered = allPatients.filter(patient => {
    if (filterBy === "id") {
      return patient.patientId.toLowerCase().includes(searchValue);
    } else if (filterBy === "name") {
      return patient.name.toLowerCase().includes(searchValue);
    }
    return true;
  });
  currentPage = 1;
  populatePatientTablePaginated(filtered);
}

async function deletePatient(id) {
  if (!confirm("Are you sure you want to delete this patient?")) return;
  await db.patients.delete(id);
  await loadPatientsFromDB();
  loadPatients();
}

function generatePatientID() {
  return "P" + Math.floor(100000 + Math.random() * 900000);
}

async function addPatient(e) {
  e.preventDefault();

  try {
    // Make sure the database is open and ready
    if (!db.isOpen()) {
      await initializeDatabase();
    }

    const patientData = {
      patientId: generatePatientID(),
      name: document.getElementById("pName").value,
      birthdate: document.getElementById("pBirthdate").value,
      gender: document.getElementById("pGender").value,
      age: document.getElementById("pAge").value,
      admissionNo: document.getElementById("pAdmissionNo").value,
      dateTime: document.getElementById("pDateTime").value,
      roomNo: document.getElementById("pRoomNo").value,
      station: document.getElementById("pStation").value,
      status: document.getElementById("pStatus").value,

      // Existing
      medicalRecords: [],
      medicationRecords: [],
      historyRecords: [],
      nursingRecords: [],
      payBillsRecords: [],
      appointmentRecords: [],
      diagnosisRecords: [],
      treatmentRecords: [],
      tprIoRecords: [],
      planningRecords: [],
      reconciliation: null,
      reconciliationRecords: [],
      marRecords: [],
      reconciliation: null,
      cdssAlertsRecords: [],

      // 🆕 Added Records
      dosingAlertsRecords: [],
      pediatricAlertsRecords: [],
      nursingHistoryRecords: []
    };

    // Add the patient to the database
    await db.patients.add(patientData);
    await loadPatientsFromDB();
    loadPatients();
    loadNotifications();
    document.getElementById("addPatientForm").reset();
    bootstrap.Modal.getInstance(document.getElementById("addPatientModal")).hide();
    showAlert("Patient added successfully!", "success");
  } catch (error) {
    console.error("Error adding patient:", error);
    showAlert("Failed to add patient. Please try again or refresh the page.", "error");
  }
}

async function viewPatient(id) {
  currentPatientIndex = id;
  const patient = getPatients().find(p => p.id === id);
  if (!patient) {
    showAlert("Patient not found!", "error");
    return;
  }

  // Initialize all record arrays if they don't exist
  if (!patient.nursingHistoryRecords) patient.nursingHistoryRecords = [];
  if (!patient.medicalRecords) patient.medicalRecords = [];
  if (!patient.medicationRecords) patient.medicationRecords = [];
  if (!patient.historyRecords) patient.historyRecords = [];
  if (!patient.nursingRecords) patient.nursingRecords = [];
  if (!patient.payBillsRecords) patient.payBillsRecords = [];
  if (!patient.appointmentRecords) patient.appointmentRecords = [];
  if (!patient.diagnosisRecords) patient.diagnosisRecords = [];
  if (!patient.treatmentRecords) patient.treatmentRecords = [];
  if (!patient.tprIoRecords) patient.tprIoRecords = [];
  if (!patient.planningRecords) patient.planningRecords = [];
  if (!patient.reconciliationRecords) patient.reconciliationRecords = [];
  if (!patient.marRecords) patient.marRecords = [];
  if (!patient.cdssAlertsRecords) patient.cdssAlertsRecords = [];
  if (!patient.dosingAlertsRecords) patient.dosingAlertsRecords = [];
  if (!patient.pediatricAlertsRecords) patient.pediatricAlertsRecords = [];

  // Update patient info in modal
  document.getElementById("viewPatientId").textContent = patient.patientId;
  document.getElementById("viewPatientName").textContent = patient.name;
  document.getElementById("viewPatientBirthdate").textContent = patient.birthdate;
  document.getElementById("viewPatientGender").textContent = patient.gender;
  document.getElementById("viewPatientAge").textContent = patient.age;

  // Update practice alert indicators before loading alerts
  updatePracticeAlertIndicators(patient);

  // Load all record displays
  loadNursingHistoryRecordsDisplay();
  loadMedicalRecords();
  loadMedicationTable();
  loadHistoryTable();
  loadNursingNotesTable();
  loadPayBillsTable();
  loadAppointmentTable();
  loadDiagnosisTable();
  loadTreatmentTable();
  loadTprIoTable();
  loadPlanningTable();
  loadReconciliationTable();
  loadMARRecordsDisplay();
  loadCdssAlerts();
  loadDosingAlertsDisplay();

  // Show the modal
  new bootstrap.Modal(document.getElementById("viewPatientModal")).show();
}

async function openEditPatientForm(id) {
  const patient = await db.patients.get(id);
  if (!patient) return;
  currentPatientIndex = id;
  document.getElementById("editPatientId").value = patient.patientId;
  document.getElementById("editFullName").value = patient.name;
  document.getElementById("editBirthdate").value = patient.birthdate;
  document.getElementById("editGender").value = patient.gender;
  document.getElementById("editAge").value = patient.age;
  document.getElementById("editAdmissionNo").value = patient.admissionNo;
  document.getElementById("editDateTime").value = patient.dateTime;
  document.getElementById("editRoomNo").value = patient.roomNo;
  document.getElementById("editStation").value = patient.station;
  document.getElementById("editStatus").value = patient.status;
  new bootstrap.Modal(document.getElementById("editPatientModal")).show();
}

async function updatePatient(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById("editPatientId").value);
  // Get the patient from the DB using currentPatientIndex (which holds the DB id)
  const patient = await db.patients.get(currentPatientIndex);
  if (!patient) return;
  patient.name = document.getElementById("editFullName").value;
  patient.birthdate = document.getElementById("editBirthdate").value;
  patient.gender = document.getElementById("editGender").value;
  patient.age = document.getElementById("editAge").value;
  patient.admissionNo = document.getElementById("editAdmissionNo").value;
  patient.dateTime = document.getElementById("editDateTime").value;
  patient.roomNo = document.getElementById("editRoomNo").value;
  patient.station = document.getElementById("editStation").value;
  patient.status = document.getElementById("editStatus").value;
  await db.patients.put(patient);
  await loadPatientsFromDB();
  loadPatients();
  loadNotifications();
  bootstrap.Modal.getInstance(document.getElementById("editPatientModal")).hide();
  showAlert("Patient updated successfully!", "success");
}

/*********************************************************
  SUB-RECORD CRUD FUNCTIONS – MEDICAL RECORDS (TEST RECORDS)
**********************************************************/
function loadMedicalRecords() {
  const tbody = document.getElementById("testRecordsBody");
  if (!tbody) {
    console.error('Element with ID "testRecordsBody" not found.');
    return;
  }
  tbody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;

  if (patient.medicalRecords) {
    patient.medicalRecords.forEach((record, i) => {
      if (record.category === currentTestType) {
        count++;
        tbody.innerHTML += `
          <tr style="background-color: #f2f2f2; color: #333;">
            <td style="border: 1px solid #d1d1d1; padding: 8px;">${record.type}</td>
            <td style="border: 1px solid #d1d1d1; padding: 8px;">${record.dateTime}</td>
            <td style="border: 1px solid #d1d1d1; padding: 8px;">${truncateText(record.result, 50)}</td>
            <td style="border: 1px solid #d1d1d1; padding: 8px;">
              <button class="btn btn-info btn-sm" style="background-color: #5a87c2; border: none; color: white;" onclick="viewTest(${i})">View</button>
              <button class="btn btn-warning btn-sm" style="background-color: #f0ad4e; border: none; color: white;" onclick="editTest(${i})">Edit</button>
              <button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteTest(${i})">Delete</button>
            </td>
          </tr>`;
      }
    });
  }

  document.getElementById("emptyTestRecords").style.display = count === 0 ? "block" : "none";
}


function openTestModal(testType, buttonEl) {
  const allButtons = document.querySelectorAll("#medicalRecordTabs button");
  allButtons.forEach(btn => {
    btn.classList.remove("btn-primary", "active");
    btn.classList.add("btn-outline-primary");
  });
  if (buttonEl) {
    buttonEl.classList.remove("btn-outline-primary");
    buttonEl.classList.add("btn-primary", "active");
  }
  document.getElementById("testRecordsHeader").textContent = testType + " Records";
  currentTestType = testType;
  currentUploadImages = [];
  document.getElementById("newImagesContainer").innerHTML = "";
  document.getElementById("viewTestImageContainer").innerHTML = "";
  document.getElementById("testRecordsTable").style.display = "block";
  loadMedicalRecords();
}

function addTestRecord() {
  document.getElementById("testMode").value = "add";
  currentTestIndex = null;
  document.getElementById("testTitle").innerText = currentTestType + " - New Record";
  document.getElementById("testDateTime").value = "";
  document.getElementById("testType").value = "";
  document.getElementById("testResult").value = "";
  document.getElementById("testDateTime").disabled = false;
  document.getElementById("testType").disabled = false;
  document.getElementById("testResult").disabled = false;
  currentUploadImages = [];
  document.getElementById("newImagesContainer").innerHTML = "";
  document.getElementById("viewTestImageContainer").innerHTML = "";
  document.getElementById("saveBtn").style.display = "inline-block";
  document.getElementById("deleteBtn").style.display = "none";
  document.getElementById("closeBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("testDetailsModal")).show();
}

function saveTest() {
  const patients = getPatients();
  if (currentPatientIndex === null) return;
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.medicalRecords) patient.medicalRecords = [];

  const dateTime = document.getElementById("testDateTime").value;
  const type = document.getElementById("testType").value.trim();
  const result = document.getElementById("testResult").value;
  const images = currentUploadImages.slice();

  if (!type || !dateTime) {
    alert("Test type and date/time are required!");
    return;
  }

  const newRecord = {
    category: currentTestType,
    type: type,
    dateTime: dateTime,
    result: result,
    images: images
  };

  if (currentTestIndex === null) {
    patient.medicalRecords.push(newRecord);
  } else {
    patient.medicalRecords[currentTestIndex] = newRecord;
  }

  db.patients.put(patient).then(() => {
    loadMedicalRecords();
    resetTestModal();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("testDetailsModal")).hide();
    showAlert("Test record saved successfully!", "success");
  });
}

function resetTestModal() {
  document.getElementById("testDateTime").value = "";
  document.getElementById("testType").value = "";
  document.getElementById("testResult").value = "";
  document.getElementById("testDateTime").disabled = false;
  document.getElementById("testType").disabled = false;
  document.getElementById("testResult").disabled = false;
  currentUploadImages = [];
  document.getElementById("newImagesContainer").innerHTML = "";
  document.getElementById("viewTestImageContainer").innerHTML = "";
  currentTestIndex = null;
}

function deleteTest(recordIndex) {
  if (!confirm("Are you sure you want to delete this test record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.medicalRecords) return;
  patient.medicalRecords.splice(recordIndex, 1);
  db.patients.put(patient).then(() => {
    loadMedicalRecords();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("testDetailsModal")).hide();
  });
}

function viewTest(recordIndex) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.medicalRecords[recordIndex];
  if (record.category !== currentTestType) {
    alert("Record mismatch");
    return;
  }
  document.getElementById("testMode").value = "view";
  document.getElementById("testTitle").innerText = "View " + record.type;
  document.getElementById("testDateTime").value = record.dateTime;
  document.getElementById("testType").value = record.type;
  document.getElementById("testResult").value = record.result;
  document.getElementById("testDateTime").disabled = true;
  document.getElementById("testType").disabled = true;
  document.getElementById("testResult").disabled = true;
  document.getElementById("saveBtn").style.display = "none";
  document.getElementById("deleteBtn").style.display = "none";
  document.getElementById("closeBtn").style.display = "inline-block";
  document.getElementById("newImagesContainer").style.display = "none";
  renderViewImages(record.images);
  currentTestIndex = recordIndex;
  new bootstrap.Modal(document.getElementById("testDetailsModal")).show();
}

function editTest(recordIndex) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.medicalRecords[recordIndex];
  if (record.category !== currentTestType) {
    alert("Record mismatch");
    return;
  }
  document.getElementById("testMode").value = "edit";
  document.getElementById("testTitle").innerText = "Edit " + record.type;
  document.getElementById("testDateTime").value = record.dateTime;
  document.getElementById("testType").value = record.type;
  document.getElementById("testResult").value = record.result;
  document.getElementById("testDateTime").disabled = false;
  document.getElementById("testType").disabled = false;
  document.getElementById("testResult").disabled = false;
  document.getElementById("saveBtn").style.display = "inline-block";
  document.getElementById("deleteBtn").style.display = "inline-block";
  document.getElementById("closeBtn").style.display = "none";
  document.getElementById("newImagesContainer").style.display = "flex";
  document.getElementById("viewTestImageContainer").style.display = "none";
  currentUploadImages = record.images ? record.images.slice() : [];
  renderEditableImages();
  currentTestIndex = recordIndex;
  new bootstrap.Modal(document.getElementById("testDetailsModal")).show();
}

function renderViewImages(imageArray) {
  const container = document.getElementById("viewTestImageContainer");
  container.innerHTML = "";
  container.style.display = "flex";
  imageArray.forEach(obj => {
    const img = document.createElement("img");
    img.src = obj.src;
    img.style.width = "100px";
    img.style.height = "100px";
    img.style.objectFit = "cover";
    img.style.border = "1px solid #ddd";
    img.style.borderRadius = "4px";
    img.style.margin = "5px";
    container.appendChild(img);
  });
}

function renderEditableImages() {
  const container = document.getElementById("newImagesContainer");
  container.innerHTML = "";
  currentUploadImages.forEach((obj, index) => {
    displayTestImagePreview(obj, index);
  });
}

function displayTestImagePreview(imageObj, index) {
  const wrapperDiv = document.createElement("div");
  wrapperDiv.style.position = "relative";
  wrapperDiv.style.display = "inline-block";
  wrapperDiv.style.margin = "5px";

  const img = document.createElement("img");
  img.src = imageObj.src;
  img.style.width = "100px";
  img.style.height = "100px";
  img.style.objectFit = "cover";
  img.style.border = "1px solid #ddd";
  img.style.borderRadius = "4px";

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "×";
  removeBtn.style.position = "absolute";
  removeBtn.style.top = "2px";
  removeBtn.style.right = "2px";
  removeBtn.style.background = "rgba(255, 0, 0, 0.8)";
  removeBtn.style.color = "white";
  removeBtn.style.border = "none";
  removeBtn.style.borderRadius = "50%";
  removeBtn.style.cursor = "pointer";
  removeBtn.style.width = "20px";
  removeBtn.style.height = "20px";
  removeBtn.style.lineHeight = "18px";
  removeBtn.style.fontSize = "14px";
  removeBtn.addEventListener("click", function() {
    wrapperDiv.remove();
    currentUploadImages = currentUploadImages.filter((_, i) => i !== index);
    renderEditableImages();
  });

  wrapperDiv.appendChild(img);
  wrapperDiv.appendChild(removeBtn);
  container.appendChild(wrapperDiv);
}

/*********************************************************
  MEDICATION CRUD FUNCTIONS
**********************************************************/
function openMedicationForm() {
  // Reset form fields
  document.getElementById("medIndex").value = "";
  document.getElementById("medDate").value = "";
  document.getElementById("medName").value = "";
  currentMedicationIndex = null;

  // Show edit content, hide view content
  document.getElementById("medEditContent").style.display = "block";
  document.getElementById("medViewContent").style.display = "none";

  // Show edit mode buttons, hide view mode buttons
  document.getElementById("medEditButtons").style.display = "block";
  document.getElementById("medViewButtons").style.display = "none";

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById("medicationModal"));
  modal.show();
}

function loadMedicationTable() {
  const tableBody = document.getElementById("medicationTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.medicationRecords) {
    patient.medicationRecords.forEach((rec, i) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${rec.date}</td>
          <td>${truncateText(rec.medication, 50)}</td>
          <td>
              ${createActionButton('view', `viewMedication(${i})`)}
              ${createActionButton('edit', `editMedication(${i})`)}
              ${createActionButton('delete', `deleteMedication(${i})`)}
          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyMedication").style.display = count === 0 ? "block" : "none";
}

function saveMedication() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.medicationRecords) patient.medicationRecords = [];

  const indexVal = document.getElementById("medIndex").value;
  const dateVal = document.getElementById("medDate").value;
  const nameVal = document.getElementById("medName").value;

  if (!dateVal || !nameVal) {
    alert("Please fill in date and medication fields.");
    return;
  }

  const record = { date: dateVal, medication: nameVal };

  if (indexVal === "") {
    patient.medicationRecords.push(record);
  } else {
    patient.medicationRecords[indexVal] = record;
  }

  db.patients.put(patient).then(() => {
    loadMedicationTable();

    // Update view mode content with the new values
    document.getElementById("viewMedDate").textContent = dateVal;
    document.getElementById("viewMedDetails").textContent = nameVal;

    // Switch to view mode
    switchToViewMode();

    showAlert("Medication record saved successfully!", "success");
  });
}

function viewMedication(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const rec = patient.medicationRecords[index];
  if (!rec) return;

  // Set hidden index
  document.getElementById("medIndex").value = index;

  // Populate view content
  document.getElementById("viewMedDate").textContent = rec.date || "";
  document.getElementById("viewMedDetails").textContent = rec.medication || "";

  // Hide edit content, show view content
  document.getElementById("medEditContent").style.display = "none";
  document.getElementById("medViewContent").style.display = "block";

  // Show view mode buttons, hide edit mode buttons
  document.getElementById("medViewButtons").style.display = "block";
  document.getElementById("medEditButtons").style.display = "none";

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById("medicationModal"));
  modal.show();
}

function switchToEditMode() {
  // For patient info modal
  if (document.getElementById('patientInfoViewMode')) {
    document.getElementById('patientInfoViewMode').style.display = 'none';
    document.getElementById('patientInfoEditMode').style.display = 'block';
    document.getElementById('patientInfoViewButtons').style.display = 'none';
    document.getElementById('patientInfoEditButtons').style.display = 'block';
  }

  // For medication modal
  if (document.getElementById('medViewContent')) {
    document.getElementById('medViewContent').style.display = 'none';
    document.getElementById('medEditContent').style.display = 'block';
    document.getElementById('medViewButtons').style.display = 'none';
    document.getElementById('medEditButtons').style.display = 'block';
  }
}

function editMedication(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const rec = patient.medicationRecords[index];
  if (!rec) return;

  // Set form values
  document.getElementById("medIndex").value = index;
  document.getElementById("medDate").value = rec.date;
  document.getElementById("medName").value = rec.medication;

  // Show edit content, hide view content
  document.getElementById("medEditContent").style.display = "block";
  document.getElementById("medViewContent").style.display = "none";

  // Show edit mode buttons, hide view mode buttons
  document.getElementById("medEditButtons").style.display = "block";
  document.getElementById("medViewButtons").style.display = "none";

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById("medicationModal"));
  modal.show();
}

function deleteMedication(indexOverride) {
  const idx = typeof indexOverride === "number" ? indexOverride : document.getElementById("medIndex").value;
  if (!confirm("Delete this medication record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.medicationRecords.splice(idx, 1);
  db.patients.put(patient).then(() => {
    loadMedicationTable();
    bootstrap.Modal.getInstance(document.getElementById("medicationModal")).hide();
    showAlert("Medication record deleted successfully!", "success");
  });
}

/*********************************************************
  HISTORY CRUD FUNCTIONS
**********************************************************/
function openHistoryForm() {
  document.getElementById("historyIndex").value = "";
  document.getElementById("historyDate").value = "";
  document.getElementById("historyNote").value = "";
  document.getElementById("historyDate").disabled = false;
  document.getElementById("historyNote").disabled = false;
  document.getElementById("historySaveBtn").style.display = "inline-block";
  document.getElementById("historyDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("historyModal")).show();
}

function loadHistoryTable() {
  const tableBody = document.getElementById("historyTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.historyRecords) {
    patient.historyRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${truncateText(record.note, 50)}</td>
          <td>
${createActionButton('view', `viewHistoryRecord(${index})`)}
${createActionButton('edit', `editHistoryRecord(${index})`)}
${createActionButton('delete', `deleteHistoryRecord(${index})`)}

          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyHistory").style.display = count === 0 ? "block" : "none";
}

function saveHistoryRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.historyRecords) patient.historyRecords = [];
  const indexVal = document.getElementById("historyIndex").value;
  const dateVal = document.getElementById("historyDate").value;
  const noteVal = document.getElementById("historyNote").value;
  if (indexVal === "") {
    patient.historyRecords.push({ date: dateVal, note: noteVal });
  } else {
    patient.historyRecords[indexVal] = { date: dateVal, note: noteVal };
  }
  db.patients.put(patient).then(() => {
    loadHistoryTable();
    bootstrap.Modal.getInstance(document.getElementById("historyModal")).hide();
  });
}

function viewHistoryRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.historyRecords[index];
  if (!record) return;
  document.getElementById("historyIndex").value = index;
  document.getElementById("historyDate").value = record.date;
  document.getElementById("historyNote").value = record.note;
  document.getElementById("historyDate").disabled = true;
  document.getElementById("historyNote").disabled = true;
  document.getElementById("historySaveBtn").style.display = "none";
  document.getElementById("historyDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("historyModal")).show();
}

function editHistoryRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.historyRecords[index];
  if (!record) return;
  document.getElementById("historyIndex").value = index;
  document.getElementById("historyDate").value = record.date;
  document.getElementById("historyNote").value = record.note;
  document.getElementById("historyDate").disabled = false;
  document.getElementById("historyNote").disabled = false;
  document.getElementById("historySaveBtn").style.display = "inline-block";
  document.getElementById("historyDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("historyModal")).show();
}

function deleteHistoryRecord(index) {
  if (!confirm("Are you sure you want to delete this history record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.historyRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadHistoryTable();
    bootstrap.Modal.getInstance(document.getElementById("historyModal")).hide();
  });
}

/*********************************************************
  NURSING NOTES CRUD FUNCTIONS
**********************************************************/
function openNursingNotesForm() {
  document.getElementById("nursingNotesIndex").value = "";
  document.getElementById("nursingNotesDate").value = "";
  document.getElementById("nursingNotesTextInput").value = "";
  document.getElementById("nursingNotesDate").disabled = false;
  document.getElementById("nursingNotesTextInput").disabled = false;
  document.getElementById("nursingSaveBtn").style.display = "inline-block";
  document.getElementById("nursingDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("nursingNotesModal")).show();
}

function loadNursingNotesTable() {
  const tableBody = document.getElementById("nursingNotesTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.nursingRecords) {
    patient.nursingRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${truncateText(record.note, 50)}</td>
          <td>
            ${createActionButton('view', `viewNursingNotesRecord(${index})`)}
            ${createActionButton('edit', `editNursingNotesRecord(${index})`)}
            ${createActionButton('delete', `deleteNursingNotesRecord(${index})`)}
          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyNursing").style.display = count === 0 ? "block" : "none";
}

function saveNursingNotesRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.nursingRecords) patient.nursingRecords = [];
  const indexVal = document.getElementById("nursingNotesIndex").value;
  const nursingDate = document.getElementById("nursingNotesDate").value;
  const nursingNote = document.getElementById("nursingNotesTextInput").value;
  if (indexVal === "") {
    patient.nursingRecords.push({ date: nursingDate, note: nursingNote });
  } else {
    patient.nursingRecords[indexVal] = { date: nursingDate, note: nursingNote };
  }
  db.patients.put(patient).then(() => {
    loadNursingNotesTable();
    bootstrap.Modal.getInstance(document.getElementById("nursingNotesModal")).hide();
  });
}

function viewNursingNotesRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.nursingRecords[index];
  if (!record) return;
  document.getElementById("nursingNotesIndex").value = index;
  document.getElementById("nursingNotesDate").value = record.date;
  document.getElementById("nursingNotesTextInput").value = record.note;
  document.getElementById("nursingNotesDate").disabled = true;
  document.getElementById("nursingNotesTextInput").disabled = true;
  document.getElementById("nursingSaveBtn").style.display = "none";
  document.getElementById("nursingDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("nursingNotesModal")).show();
}

function editNursingNotesRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.nursingRecords[index];
  if (!record) return;
  document.getElementById("nursingNotesIndex").value = index;
  document.getElementById("nursingNotesDate").value = record.date;
  document.getElementById("nursingNotesTextInput").value = record.note;
  document.getElementById("nursingNotesDate").disabled = false;
  document.getElementById("nursingNotesTextInput").disabled = false;
  document.getElementById("nursingSaveBtn").style.display = "inline-block";
  document.getElementById("nursingDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("nursingNotesModal")).show();
}

function deleteNursingNotesRecord(index) {
  if (!confirm("Are you sure you want to delete this nursing note?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.nursingRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadNursingNotesTable();
    bootstrap.Modal.getInstance(document.getElementById("nursingNotesModal")).hide();
  });
}

/*********************************************************
  PAY BILLS CRUD FUNCTIONS
**********************************************************/
function openPayBillsForm() {
  document.getElementById("payBillsIndex").value = "";
  document.getElementById("billDebtInput").value = "";
  document.getElementById("billCreditInput").value = "";
  document.getElementById("billBalanceInput").value = "";
  document.getElementById("billOverdueInput").value = "";
  document.getElementById("billNextDueInput").value = "";
  new bootstrap.Modal(document.getElementById("payBillsModal")).show();
}

function loadPayBillsTable() {
  const tableBody = document.getElementById("payBillsTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (!patient.payBillsRecords) patient.payBillsRecords = [];
  patient.payBillsRecords.forEach((record, index) => {
    count++;
    tableBody.innerHTML += `
      <tr>
        <td>${record.debt}</td>
        <td>${record.credit}</td>
        <td>${record.balance}</td>
        <td>${record.overdue != null ? record.overdue : ""}</td>
        <td>${record.nextDue ? record.nextDue : ""}</td>
        <td>
          ${createActionButton('view', `viewPayBillsRecord(${index})`)}
          ${createActionButton('edit', `editPayBillsRecord(${index})`)}
          ${createActionButton('delete', `deletePayBillsRecord(${index})`)}

        </td>
      </tr>`;
  });
  document.getElementById("emptyPayBills").style.display = count === 0 ? "block" : "none";
}

function savePayBillsRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.payBillsRecords) patient.payBillsRecords = [];
  const indexVal = document.getElementById("payBillsIndex").value;
  const debtVal = document.getElementById("billDebtInput").value;
  const creditVal = document.getElementById("billCreditInput").value;
  const balanceVal = document.getElementById("billBalanceInput").value;
  const overdueRaw = document.getElementById("billOverdueInput").value;
  const overdueVal = overdueRaw ? parseInt(overdueRaw, 10) : 0;
  const nextDueVal = document.getElementById("billNextDueInput").value;
  const record = { debt: debtVal, credit: creditVal, balance: balanceVal, overdue: overdueVal, nextDue: nextDueVal };
  if (indexVal === "") {
    patient.payBillsRecords.push(record);
  } else {
    patient.payBillsRecords[indexVal] = record;
  }
  db.patients.put(patient).then(() => {
    loadPayBillsTable();
    bootstrap.Modal.getInstance(document.getElementById("payBillsModal")).hide();
  });
}

function viewPayBillsRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.payBillsRecords[index];
  if (!record) return;
  document.getElementById("payBillsIndex").value = index;
  document.getElementById("billDebtInput").value = record.debt;
  document.getElementById("billCreditInput").value = record.credit;
  document.getElementById("billBalanceInput").value = record.balance;
  document.getElementById("billOverdueInput").value = record.overdue != null ? record.overdue : "";
  document.getElementById("billNextDueInput").value = record.nextDue || "";
  document.getElementById("billDebtInput").disabled = true;
  document.getElementById("billCreditInput").disabled = true;
  document.getElementById("billBalanceInput").disabled = true;
  document.getElementById("billOverdueInput").disabled = true;
  document.getElementById("billNextDueInput").disabled = true;
  document.getElementById("payBillsSaveBtn").style.display = "none";
  document.getElementById("payBillsDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("payBillsModal")).show();
}

function editPayBillsRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.payBillsRecords[index];
  if (!record) return;
  document.getElementById("payBillsIndex").value = index;
  document.getElementById("billDebtInput").value = record.debt;
  document.getElementById("billCreditInput").value = record.credit;
  document.getElementById("billBalanceInput").value = record.balance;
  document.getElementById("billOverdueInput").value = record.overdue != null ? record.overdue : "";
  document.getElementById("billNextDueInput").value = record.nextDue || "";
  document.getElementById("billDebtInput").disabled = false;
  document.getElementById("billCreditInput").disabled = false;
  document.getElementById("billBalanceInput").disabled = false;
  document.getElementById("billOverdueInput").disabled = false;
  document.getElementById("billNextDueInput").disabled = false;
  document.getElementById("payBillsSaveBtn").style.display = "inline-block";
  document.getElementById("payBillsDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("payBillsModal")).show();
}

function deletePayBillsRecord(indexOverride) {
  const idx = typeof indexOverride === "number" ? indexOverride : document.getElementById("payBillsIndex").value;
  if (!confirm("Delete this Pay Bills record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.payBillsRecords.splice(idx, 1);
  db.patients.put(patient).then(() => {
    loadPayBillsTable();
    bootstrap.Modal.getInstance(document.getElementById("payBillsModal")).hide();
  });
}

/*********************************************************
  APPOINTMENT CRUD FUNCTIONS
**********************************************************/
function openAppointmentForm() {
  document.getElementById("appointmentIndex").value = "";
  document.getElementById("appointmentDate").value = "";
  document.getElementById("appointmentTime").value = "";
  document.getElementById("appointmentContact").value = "";
  document.getElementById("appointmentWard").value = "";
  document.getElementById("appointmentDate").disabled = false;
  document.getElementById("appointmentTime").disabled = false;
  document.getElementById("appointmentContact").disabled = false;
  document.getElementById("appointmentWard").disabled = false;
  document.getElementById("appointmentSaveBtn").style.display = "inline-block";
  document.getElementById("appointmentDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function loadAppointmentTable() {
  const tableBody = document.getElementById("appointmentTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.appointmentRecords) {
    patient.appointmentRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${record.time || ""}</td>
          <td>${record.contact || ""}</td>
          <td>${record.ward || ""}</td>
          <td>
          <button class="btn btn-info btn-sm" style="background-color: #5a87c2; border: none; color: white;" onclick="viewAppointmentRecord(${index})">View</button>
<button class="btn btn-warning btn-sm" style="background-color: #f0ad4e; border: none; color: white;" onclick="editAppointmentRecord(${index})">Edit</button>
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteAppointmentRecord(${index})">Delete</button>

          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyAppointment").style.display = count === 0 ? "block" : "none";
}

function saveAppointmentRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.appointmentRecords) patient.appointmentRecords = [];
  const indexVal = document.getElementById("appointmentIndex").value;
  const dateVal = document.getElementById("appointmentDate").value;
  const timeVal = document.getElementById("appointmentTime").value;
  const contactVal = document.getElementById("appointmentContact").value;
  const wardVal = document.getElementById("appointmentWard").value;
  if (indexVal === "") {
    patient.appointmentRecords.push({ date: dateVal, time: timeVal, contact: contactVal, ward: wardVal });
  } else {
    patient.appointmentRecords[indexVal] = { date: dateVal, time: timeVal, contact: contactVal, ward: wardVal };
  }
  db.patients.put(patient).then(() => {
    loadAppointmentTable();
    bootstrap.Modal.getInstance(document.getElementById("appointmentModal")).hide();
  });
}

function viewAppointmentRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.appointmentRecords[index];
  if (!record) return;
  document.getElementById("appointmentIndex").value = index;
  document.getElementById("appointmentDate").value = record.date;
  document.getElementById("appointmentTime").value = record.time || "";
  document.getElementById("appointmentContact").value = record.contact || "";
  document.getElementById("appointmentWard").value = record.ward || "";
  document.getElementById("appointmentDate").disabled = true;
  document.getElementById("appointmentTime").disabled = true;
  document.getElementById("appointmentContact").disabled = true;
  document.getElementById("appointmentWard").disabled = true;
  document.getElementById("appointmentSaveBtn").style.display = "none";
  document.getElementById("appointmentDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function editAppointmentRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.appointmentRecords[index];
  if (!record) return;
  document.getElementById("appointmentIndex").value = index;
  document.getElementById("appointmentDate").value = record.date;
  document.getElementById("appointmentTime").value = record.time || "";
  document.getElementById("appointmentContact").value = record.contact || "";
  document.getElementById("appointmentWard").value = record.ward || "";
  document.getElementById("appointmentDate").disabled = false;
  document.getElementById("appointmentTime").disabled = false;
  document.getElementById("appointmentContact").disabled = false;
  document.getElementById("appointmentWard").disabled = false;
  document.getElementById("appointmentSaveBtn").style.display = "inline-block";
  document.getElementById("appointmentDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function deleteAppointmentRecord(index) {
  if (!confirm("Are you sure you want to delete this appointment?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.appointmentRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadAppointmentTable();
    bootstrap.Modal.getInstance(document.getElementById("appointmentModal")).hide();
  });
}

/*********************************************************
  DIAGNOSIS CRUD FUNCTIONS
**********************************************************/
function openDiagnosisForm() {
  document.getElementById("diagnosisIndex").value = "";
  document.getElementById("diagnosisDate").value = "";
  document.getElementById("diagnosisNote").value = "";
  document.getElementById("diagnosisDate").disabled = false;
  document.getElementById("diagnosisNote").disabled = false;
  document.getElementById("diagnosisSaveBtn").style.display = "inline-block";
  document.getElementById("diagnosisDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("diagnosisModal")).show();
}

function loadDiagnosisTable() {
  const tableBody = document.getElementById("diagnosisTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.diagnosisRecords) {
    patient.diagnosisRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${truncateText(record.diagnosis, 50)}</td>
          <td>
            ${createActionButton('view', `viewDiagnosisRecord(${index})`)}
            ${createActionButton('edit', `editDiagnosisRecord(${index})`)}
            ${createActionButton('delete', `deleteDiagnosisRecord(${index})`)}
          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyDiagnosis").style.display = count === 0 ? "block" : "none";
}

function saveDiagnosisRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.diagnosisRecords) patient.diagnosisRecords = [];
  const indexVal = document.getElementById("diagnosisIndex").value;
  const dateVal = document.getElementById("diagnosisDate").value;
  const diagnosisVal = document.getElementById("diagnosisNote").value;
  if (indexVal === "") {
    patient.diagnosisRecords.push({ date: dateVal, diagnosis: diagnosisVal });
  } else {
    patient.diagnosisRecords[indexVal] = { date: dateVal, diagnosis: diagnosisVal };
  }
  db.patients.put(patient).then(() => {
    loadDiagnosisTable();
    bootstrap.Modal.getInstance(document.getElementById("diagnosisModal")).hide();
  });
}

function viewDiagnosisRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.diagnosisRecords[index];
  if (!record) return;
  document.getElementById("diagnosisIndex").value = index;
  document.getElementById("diagnosisDate").value = record.date;
  document.getElementById("diagnosisNote").value = record.diagnosis;
  document.getElementById("diagnosisDate").disabled = true;
  document.getElementById("diagnosisNote").disabled = true;
  document.getElementById("diagnosisSaveBtn").style.display = "none";
  document.getElementById("diagnosisDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("diagnosisModal")).show();
}

function editDiagnosisRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.diagnosisRecords[index];
  if (!record) return;
  document.getElementById("diagnosisIndex").value = index;
  document.getElementById("diagnosisDate").value = record.date;
  document.getElementById("diagnosisNote").value = record.diagnosis;
  document.getElementById("diagnosisDate").disabled = false;
  document.getElementById("diagnosisNote").disabled = false;
  document.getElementById("diagnosisSaveBtn").style.display = "inline-block";
  document.getElementById("diagnosisDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("diagnosisModal")).show();
}

function deleteDiagnosisRecord(index) {
  if (!confirm("Are you sure you want to delete this diagnosis record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.diagnosisRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadDiagnosisTable();
    bootstrap.Modal.getInstance(document.getElementById("diagnosisModal")).hide();
  });
}

/*********************************************************
  TREATMENT CRUD FUNCTIONS
**********************************************************/
function openTreatmentForm() {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function setupIOCalculations() {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function calculateTotalInput() {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function calculateTotalOutput() {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function loadTreatmentTable() {
    // This function is now a no-op since the treatment tab has been removed
    // We keep the function to avoid breaking existing code that calls it
    return;
}

function saveTreatmentRecord() {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function viewTreatmentRecord(/* index */) {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function editTreatmentRecord(/* index */) {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function enableTreatmentFields(/* enable */) {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

function deleteTreatmentRecord(/* index */) {
    // This function is now a no-op since the treatment tab has been removed
    return;
}

/*********************************************************
  PLANNING CRUD FUNCTIONS
**********************************************************/
function openPlanningForm() {
  document.getElementById("planningIndex").value = "";
  document.getElementById("planningDate").value = "";
  document.getElementById("planningNote").value = "";
  document.getElementById("planningDate").disabled = false;
  document.getElementById("planningNote").disabled = false;
  document.getElementById("planningSaveBtn").style.display = "inline-block";
  document.getElementById("planningDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("planningModal")).show();
}

function loadPlanningTable() {
  const tableBody = document.getElementById("planningTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.planningRecords) {
    patient.planningRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${truncateText(record.plan, 50)}</td>
          <td>
            ${createActionButton('view', `viewPlanningRecord(${index})`)}
            ${createActionButton('edit', `editPlanningRecord(${index})`)}
            ${createActionButton('delete', `deletePlanningRecord(${index})`)}
          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyPlanning").style.display = count === 0 ? "block" : "none";
}

function savePlanningRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.planningRecords) patient.planningRecords = [];
  const indexVal = document.getElementById("planningIndex").value;
  const dateVal = document.getElementById("planningDate").value;
  const planVal = document.getElementById("planningNote").value;
  if (indexVal === "") {
    patient.planningRecords.push({ date: dateVal, plan: planVal });
  } else {
    patient.planningRecords[indexVal] = { date: dateVal, plan: planVal };
  }
  db.patients.put(patient).then(() => {
    loadPlanningTable();
    bootstrap.Modal.getInstance(document.getElementById("planningModal")).hide();
  });
}

function viewPlanningRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.planningRecords[index];
  if (!record) return;
  document.getElementById("planningIndex").value = index;
  document.getElementById("planningDate").value = record.date;
  document.getElementById("planningNote").value = record.plan;
  document.getElementById("planningDate").disabled = true;
  document.getElementById("planningNote").disabled = true;
  document.getElementById("planningSaveBtn").style.display = "none";
  document.getElementById("planningDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("planningModal")).show();
}

function editPlanningRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.planningRecords[index];
  if (!record) return;
  document.getElementById("planningIndex").value = index;
  document.getElementById("planningDate").value = record.date;
  document.getElementById("planningNote").value = record.plan;
  document.getElementById("planningDate").disabled = false;
  document.getElementById("planningNote").disabled = false;
  document.getElementById("planningSaveBtn").style.display = "inline-block";
  document.getElementById("planningDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("planningModal")).show();
}

function deletePlanningRecord(index) {
  if (!confirm("Are you sure you want to delete this planning record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.planningRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadPlanningTable();
    bootstrap.Modal.getInstance(document.getElementById("planningModal")).hide();
  });
}

function openReconciliationForm() {
  // Reset form and clear index (for new record)
  document.getElementById('reconciliationIndex').value = '';
  document.getElementById('editReconDrug').value = '';
  document.getElementById('editReconDose').value = '';
  document.getElementById('editReconRoute').value = '';
  document.getElementById('editReconFrequency').value = '';
  document.getElementById('editReconDuration').value = '';
  document.getElementById('editReconTime').value = '';
  document.getElementById('editReconAllergies').value = '';
  document.getElementById('editReconMedAdmission').value = '';
  document.getElementById('editReconHomeMeds').value = '';
  document.getElementById('editReconNurseDoctor').value = '';

  // Show edit content, hide view content
  document.getElementById('reconEditContent').style.display = 'block';
  document.getElementById('reconViewContent').style.display = 'none';

  // Show save button, hide delete button
  document.getElementById('reconSaveBtn').style.display = 'inline-block';
  document.getElementById('reconDeleteBtn').style.display = 'none';

  const modal = new bootstrap.Modal(document.getElementById('reconciliationModal'));
  modal.show();
}

function viewReconciliationRecord(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.reconciliationRecords || !patient.reconciliationRecords[index]) return;

  const record = patient.reconciliationRecords[index];

  // Set the current index for potential editing
  document.getElementById('reconciliationIndex').value = index;

  // Update view content
  document.getElementById('viewReconPatient').textContent = patient.name || '—';
  document.getElementById('viewReconRoom').textContent = patient.roomNo || '—';
  document.getElementById('viewReconDrug').textContent = record.drug || '—';
  document.getElementById('viewReconDose').textContent = record.dose || '—';
  document.getElementById('viewReconRoute').textContent = record.route || '—';
  document.getElementById('viewReconFrequency').textContent = record.frequency || '—';
  document.getElementById('viewReconDuration').textContent = record.duration || '—';
  document.getElementById('viewReconTime').textContent = record.time || '—';
  document.getElementById('viewReconAllergies').textContent = record.allergies || '—';
  document.getElementById('viewReconAdmission').textContent = record.medOnAdmission || '—';
  document.getElementById('viewReconDischarge').textContent = record.homeMedsDischarge || '—';
  document.getElementById('viewReconNurseDoctor').textContent = record.nurseDoctor || '—';

  // Show view content, hide edit content
  document.getElementById('reconViewContent').style.display = 'block';
  document.getElementById('reconEditContent').style.display = 'none';

  // Hide action buttons in view mode
  document.getElementById('reconSaveBtn').style.display = 'none';
  document.getElementById('reconDeleteBtn').style.display = 'none';

  const modal = new bootstrap.Modal(document.getElementById('reconciliationModal'));
  modal.show();
}

function editReconciliationRecord(index) {
  console.log("Editing reconciliation record with index:", index);
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.reconciliationRecords || !patient.reconciliationRecords[index]) {
    console.error("Failed to find patient or record:", {
      patientExists: !!patient,
      recordsExist: !!patient?.reconciliationRecords,
      recordExists: !!patient?.reconciliationRecords?.[index]
    });
    return;
  }

  const record = patient.reconciliationRecords[index];
  console.log("Found record:", record);

  // Set the current index for saving
  document.getElementById('reconciliationIndex').value = index;

  // Populate edit fields
  document.getElementById('editReconDrug').value = record.drug || '';
  document.getElementById('editReconDose').value = record.dose || '';
  document.getElementById('editReconRoute').value = record.route || '';
  document.getElementById('editReconFrequency').value = record.frequency || '';
  document.getElementById('editReconDuration').value = record.duration || '';
  // Format the time value for datetime-local input
  if (record.time) {
    try {
      // Try to format the date for the datetime-local input
      const date = new Date(record.time);
      if (!isNaN(date.getTime())) {
        // Format as YYYY-MM-DDThh:mm
        const formattedDate = date.toISOString().slice(0, 16);
        document.getElementById('editReconTime').value = formattedDate;
        console.log("Formatted time:", formattedDate);
      } else {
        document.getElementById('editReconTime').value = '';
        console.warn("Invalid date:", record.time);
      }
    } catch (e) {
      console.error("Error formatting date:", e);
      document.getElementById('editReconTime').value = '';
    }
  } else {
    document.getElementById('editReconTime').value = '';
  }
  document.getElementById('editReconAllergies').value = record.allergies || '';
  document.getElementById('editReconMedAdmission').value = record.medOnAdmission || '';
  document.getElementById('editReconHomeMeds').value = record.homeMedsDischarge || '';
  document.getElementById('editReconNurseDoctor').value = record.nurseDoctor || '';

  // Show edit content, hide view content
  document.getElementById('reconEditContent').style.display = 'block';
  document.getElementById('reconViewContent').style.display = 'none';

  // Show action buttons in edit mode
  document.getElementById('reconSaveBtn').style.display = 'inline-block';
  document.getElementById('reconDeleteBtn').style.display = 'inline-block';

  const modal = new bootstrap.Modal(document.getElementById('reconciliationModal'));
  modal.show();
}

async function saveEditedReconciliation() {
  console.log("Saving reconciliation record");
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) {
    console.error("Patient not found");
    return;
  }

  const index = document.getElementById('reconciliationIndex').value;
  console.log("Index from form:", index);

  const record = {
    drug: document.getElementById('editReconDrug').value.trim(),
    dose: document.getElementById('editReconDose').value.trim(),
    route: document.getElementById('editReconRoute').value.trim(),
    frequency: document.getElementById('editReconFrequency').value.trim(),
    duration: document.getElementById('editReconDuration').value.trim(),
    time: document.getElementById('editReconTime').value || new Date().toISOString(),
    allergies: document.getElementById('editReconAllergies').value.trim(),
    medOnAdmission: document.getElementById('editReconMedAdmission').value,
    homeMedsDischarge: document.getElementById('editReconHomeMeds').value,
    nurseDoctor: document.getElementById('editReconNurseDoctor').value.trim(),
    timestamp: new Date().toISOString()
  };

  if (!patient.reconciliationRecords) {
    patient.reconciliationRecords = [];
  }

  // If index is provided, update existing record, otherwise add new one
  if (index !== '') {
    console.log("Updating existing record at index:", index);
    patient.reconciliationRecords[parseInt(index)] = record;
  } else {
    console.log("Adding new record");
    patient.reconciliationRecords.push(record);
  }

  console.log("Updated reconciliation records:", patient.reconciliationRecords);

  // Save to database
  await savePatients(getPatients());

  // Close modal and refresh display
  const modal = bootstrap.Modal.getInstance(document.getElementById('reconciliationModal'));
  modal.hide();

  loadReconciliationTable();
  showAlert("Reconciliation record saved successfully", "success");
}

async function deleteReconciliationRecord(index) {
  if (!confirm("Are you sure you want to delete this reconciliation record?")) return;

  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.reconciliationRecords) return;

  patient.reconciliationRecords.splice(index, 1);
  await savePatients(getPatients());

  loadReconciliationTable();
  const modal = bootstrap.Modal.getInstance(document.getElementById('reconciliationModal'));
  if (modal) modal.hide();

  showAlert("Reconciliation record deleted successfully", "success");
}

function loadReconciliationTable() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const tableBody = document.getElementById('reconciliationTableBody');
  const emptyMessage = document.getElementById('emptyReconciliation');

  if (!patient || !patient.reconciliationRecords || patient.reconciliationRecords.length === 0) {
    if (tableBody) tableBody.innerHTML = '';
    if (emptyMessage) emptyMessage.style.display = 'block';
    return;
  }

  if (emptyMessage) emptyMessage.style.display = 'none';

  const html = patient.reconciliationRecords.map((record, index) => `
    <tr>
      <td>${record.drug || '—'}</td>
      <td>${record.time ? new Date(record.time).toLocaleString() : '—'}</td>
      <td>
        ${createActionButton('view', `viewReconciliationRecord(${index})`)}
        ${createActionButton('edit', `editReconciliationRecord(${index})`)}
        ${createActionButton('delete', `deleteReconciliationRecord(${index})`)}
      </td>
    </tr>
  `).join('');

  if (tableBody) tableBody.innerHTML = html;
}

/*********************************************************
  NURSING HISTORY CRUD FUNCTIONS (Updated)
**********************************************************/
// Opens the Nursing History modal for a new entry.
function openNursingHistoryModal() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;

  // Get the most recent nursing history record
  const lastRecord = patient.nursingHistoryRecords?.[patient.nursingHistoryRecords.length - 1] || {};

  // Populate the form with the last saved data
  document.getElementById('nursingHistoryAllergies').value = lastRecord.allergies || '';
  document.getElementById('pastImmunization').value = lastRecord.pastImmunization || '';
  document.getElementById('nursingHistoryFamily').value = lastRecord.familyHistory || '';
  document.getElementById('nursingHistoryPresent').value = lastRecord.presentIllness || '';
  document.getElementById('nursingHistoryPast').value = lastRecord.pastIllness || '';

  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById('nursingHistoryModal'));
  modal.show();
}

async function saveNursingHistoryRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);

  if (!patient) {
    showAlert("Patient not found", "error");
    return;
  }

  const record = {
    presentIllness: document.getElementById('nursingHistoryPresent').value.trim(),
    pastIllness: document.getElementById('nursingHistoryPast').value.trim(),
    familyHistory: document.getElementById('nursingHistoryFamily').value.trim(),
    allergies: document.getElementById('nursingHistoryAllergies').value.trim(),
    pastImmunization: document.getElementById('pastImmunization').value.trim(),
    timestamp: new Date().toISOString()
  };

  // Initialize nursingHistoryRecords array if it doesn't exist
  if (!patient.nursingHistoryRecords) {
    patient.nursingHistoryRecords = [];
  }

  // Add new record
    patient.nursingHistoryRecords.push(record);

  // Save to database
  await savePatients(patients);

  // Check for allergy conflicts if allergies were entered
  if (record.allergies) {
    await checkAllergyConflictWithMAR(record.allergies);
  }

  // Close modal and refresh display
  const modal = bootstrap.Modal.getInstance(document.getElementById('nursingHistoryModal'));
  modal.hide();

  loadNursingHistoryRecordsDisplay();
  showAlert("Nursing history saved successfully", "success");
}

function loadNursingHistoryRecordsDisplay() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);

  // Get the most recent record
  const record = patient?.nursingHistoryRecords?.[patient.nursingHistoryRecords.length - 1] || {};

  // Helper function to safely display text with fallback and proper formatting
  const displayText = (text) => {
    if (!text) return '—';

    // Format the text by replacing newlines with <br> tags for proper display
    return text.trim();
  };

  // Update the display by finding each element and updating its content
  // This preserves the HTML structure instead of replacing it
  document.getElementById("nh_present").textContent = displayText(record.presentIllness);
  document.getElementById("nh_past").textContent = displayText(record.pastIllness);
  document.getElementById("nh_family").textContent = displayText(record.familyHistory);
  document.getElementById("nh_allergies").textContent = displayText(record.allergies);
  document.getElementById("nh_immunization").textContent = displayText(record.pastImmunization);

  // Show/hide empty state message
  const emptyMessage = document.getElementById('emptyNursingHistory');
  if (emptyMessage) {
    const hasData = record.presentIllness || record.pastIllness || record.familyHistory ||
                   record.allergies || record.pastImmunization;
    emptyMessage.style.display = hasData ? 'none' : 'block';
  }

  // Check for allergies in MAR records
  if (record.allergies && patient.marRecords && patient.marRecords.length > 0) {
    const allergies = record.allergies.toLowerCase().split(',').map(a => a.trim());

    patient.marRecords.forEach(mar => {
      if (mar.drug) {
        const drugName = mar.drug.toLowerCase();
        allergies.forEach(allergy => {
          if (drugName.includes(allergy)) {
            // Create CDSS alert for allergy match
            const alertData = {
              type: 'Medication-Allergy Alert',
              description: `Warning: Patient is allergic to ${allergy} and has been prescribed ${mar.drug}`,
              createdAt: new Date().toISOString()
            };

            // Add to dosing alerts if not already present
            if (!patient.dosingAlerts) {
              patient.dosingAlerts = [];
            }

            // Check if alert already exists
            const alertExists = patient.dosingAlerts.some(
              alert => alert.type === alertData.type &&
                      alert.description === alertData.description
            );

            if (!alertExists) {
              patient.dosingAlerts.push(alertData);

              // Show immediate alert to user
              const alertModal = new bootstrap.Modal(document.getElementById('centeredAlertModal'));
              document.getElementById('centeredAlertMessage').innerHTML =
                `<div class="alert alert-danger">
                  <i class="bi bi-exclamation-triangle-fill me-2"></i>
                  ${alertData.description}
                </div>`;
              alertModal.show();
            }
          }
        });
      }
    });

    // Save updated patient data with new alerts
    savePatients(getPatients());
  }
}

async function deleteNursingHistoryRecord() {
  const index = document.getElementById("nursingHistoryIndex").value;
  if (!confirm("Are you sure you want to delete this nursing history record?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient || !patient.nursingHistoryRecords) return;

  patient.nursingHistoryRecords.splice(index, 1);
  await db.patients.put(patient);
  loadNursingHistoryRecordsDisplay();
  bootstrap.Modal.getInstance(document.getElementById("nursingHistoryModal")).hide();
  showAlert("Nursing history record deleted successfully!", "success");
}

/**
 * Clears all nursing history records for the current patient
 * and creates an alert to remind the user to create a new nursing history
 */
async function clearNursingHistory() {
  try {
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient) {
      showAlert("Patient not found", "error");
      return;
    }

    if (!confirm("Are you sure you want to clear all nursing history records? This action cannot be undone.")) return;

    // Reset the nursing history records to an empty array
    patient.nursingHistoryRecords = [];

    // Create a reminder alert to create new nursing history
    if (!patient.cdssAlertsRecords) {
      patient.cdssAlertsRecords = [];
    }

    // Check if a similar alert already exists
    const existingAlert = patient.cdssAlertsRecords.find(alert =>
      alert.type === "Nursing History Required" &&
      alert.category === "practice"
    );

    // Only create a new alert if one doesn't already exist
    if (!existingAlert) {
      // Create a new practice alert
      const newAlert = {
        type: "Nursing History Required",
        category: "practice",
        dateWhenDue: new Date().toISOString().split('T')[0], // Today's date
        dueDate: "",
        untilWhen: "",
        suppressed: false,
        indicator: "red", // High priority
        description: "Patient nursing history has been cleared. Please create a new nursing history record."
      };

      patient.cdssAlertsRecords.push(newAlert);
      console.log("Created nursing history reminder alert");
    }

    // Save the updated patient data
    await db.patients.put(patient);

    // Refresh the displays
    loadNursingHistoryRecordsDisplay();
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();

    // Show success message
    showAlert("All nursing history records have been cleared! An alert has been created to remind you to create a new nursing history.", "success");
  } catch (error) {
    console.error("Error clearing nursing history:", error);
    showAlert("Error clearing nursing history: " + (error.message || "Unknown error"), "error");
  }
}

async function checkAllergyConflictWithMAR(allergyInput) {
    if (!allergyInput) return;

    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);
    if (!patient || !patient.marRecords) return;

    // Split allergies by newline and clean up
    const allergies = allergyInput.split('\n')
        .map(a => a.trim().toLowerCase())
        .filter(a => a.length > 0);

    // Check each allergy against MAR records
    for (const allergy of allergies) {
        for (const marRecord of patient.marRecords) {
            if (marRecord.drug && marRecord.drug.toLowerCase().includes(allergy)) {
                const alert = {
                    type: "Medication Dosing Alert",
                    description: `Allergy conflict detected: ${allergy} is in MAR record`,
                    createdAt: new Date().toISOString()
                };

                if (!patient.dosingAlertsRecords) {
                    patient.dosingAlertsRecords = [];
                }

                // Check if this exact alert already exists
                const existingAlert = patient.dosingAlertsRecords.find(a =>
                    a.type === alert.type &&
                    a.description === alert.description
                );

                if (!existingAlert) {
                    patient.dosingAlertsRecords.push(alert);
                    await db.patients.put(patient);
                    showNotificationAlert(`Alert: ${allergy} allergy conflict with MAR record`, "warning");
                }
            }
        }
    }
}

async function checkForAllergyAlertFromNursing(allergyInput) {
    if (!allergyInput) return;

    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);
    if (!patient || !patient.marRecords) return;

    // Split allergies by newline and clean up
    const allergies = allergyInput.split('\n')
        .map(a => a.trim().toLowerCase())
        .filter(a => a.length > 0);

    // Check each allergy against MAR records
    for (const allergy of allergies) {
        for (const marRecord of patient.marRecords) {
            if (marRecord.drug && marRecord.drug.toLowerCase().includes(allergy)) {
                const alert = {
                    type: "Medication Dosing Alert",
                    description: `Allergy conflict detected: ${allergy} is in MAR record`,
                    createdAt: new Date().toISOString()
                };

                if (!patient.dosingAlertsRecords) {
                    patient.dosingAlertsRecords = [];
                }

                // Check if this exact alert already exists
                const existingAlert = patient.dosingAlertsRecords.find(a =>
                    a.type === alert.type &&
                    a.description === alert.description
                );

                if (!existingAlert) {
                    patient.dosingAlertsRecords.push(alert);
                    await db.patients.put(patient);
                    showNotificationAlert(`Alert: ${allergy} allergy conflict with MAR record`, "warning");
                }
            }
        }
    }
}

async function checkMARAllergyConflict(drugInput) {
    if (!drugInput) return;

    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);
    if (!patient || !patient.nursingHistoryRecords) return;

    // Split drugs by newline and clean up
    const drugs = drugInput.split('\n')
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0);

    // Get all allergies from nursing history
    const allergies = patient.nursingHistoryRecords
        .map(record => record.allergies)
        .filter(allergies => allergies)
        .join('\n')
        .split('\n')
        .map(a => a.trim().toLowerCase())
        .filter(a => a.length > 0);

    // Check each drug against allergies
    for (const drug of drugs) {
        for (const allergy of allergies) {
            if (drug.includes(allergy)) {
                const alert = {
                    type: "Medication Dosing Alert",
                    description: `Allergy conflict detected: ${allergy} is in MAR record`,
                    createdAt: new Date().toISOString()
                };

                if (!patient.dosingAlertsRecords) {
                    patient.dosingAlertsRecords = [];
                }

                // Check if this exact alert already exists
                const existingAlert = patient.dosingAlertsRecords.find(a =>
                    a.type === alert.type &&
                    a.description === alert.description
                );

                if (!existingAlert) {
                    patient.dosingAlertsRecords.push(alert);
                    await db.patients.put(patient);
                    showNotificationAlert(`Alert: ${allergy} allergy conflict with MAR record`, "warning");
                }
            }
        }
    }
}

function showNotificationAlert(message, type = "info") {
  const alertBox = document.createElement("div");
  alertBox.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3 shadow`;
  alertBox.role = "alert";
  alertBox.style.zIndex = "1060";
  alertBox.innerHTML = `
    <strong>${type.charAt(0).toUpperCase() + type.slice(1)}:</strong> ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  document.body.appendChild(alertBox);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    alertBox.classList.remove("show");
    alertBox.classList.add("hide");
    setTimeout(() => alertBox.remove(), 500);
  }, 5000);
}



/*********************************************************
  MAR CRUD FUNCTIONS (Updated: Separate View vs Edit)
**********************************************************/
// Opens the MAR modal in add/edit mode.
function openMARModal(recordIndex) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;

  // Always pre-populate patient name.
  document.getElementById("marPatientName").value = patient.name || "";

  // Show the editable section and hide the view section.
  document.getElementById("marEditSection").style.display = "block";
  document.getElementById("marViewSection").style.display = "none";

  if (recordIndex === undefined) {
    // Adding new record: clear input fields.
    document.getElementById("marIndex").value = "";
    document.getElementById("marRoomNo").value = "";
    document.getElementById("marDrug").value = "";
    document.getElementById("marDose").value = "";
    document.getElementById("marRoute").value = "";
    document.getElementById("marTime").value = "";
    document.getElementById("marNurseDoctor").value = "";

    // Enable editing.
    document.getElementById("marRoomNo").disabled = false;
    document.getElementById("marDrug").disabled = false;
    document.getElementById("marDose").disabled = false;
    document.getElementById("marRoute").disabled = false;
    document.getElementById("marTime").disabled = false;
    document.getElementById("marNurseDoctor").disabled = false;

    // Show Save button, hide Delete button.
    document.getElementById("marSaveBtn").style.display = "inline-block";
    document.getElementById("marDeleteBtn").style.display = "none";
  } else {
    // Edit mode: load the record.
    const record = patient.marRecords[recordIndex];
    if (!record) return;
    document.getElementById("marIndex").value = recordIndex;
    document.getElementById("marRoomNo").value = record.roomNo || "";
    document.getElementById("marDrug").value = record.drug || "";
    document.getElementById("marDose").value = record.dose || "";
    document.getElementById("marRoute").value = record.route || "";
    document.getElementById("marTime").value = record.time || "";
    document.getElementById("marNurseDoctor").value = record.nurseDoctor || "";

    // Enable editing.
    document.getElementById("marRoomNo").disabled = false;
    document.getElementById("marDrug").disabled = false;
    document.getElementById("marDose").disabled = false;
    document.getElementById("marRoute").disabled = false;
    document.getElementById("marTime").disabled = false;
    document.getElementById("marNurseDoctor").disabled = false;

    // Show both action buttons.
    document.getElementById("marSaveBtn").style.display = "inline-block";
    document.getElementById("marDeleteBtn").style.display = "inline-block";
  }

  new bootstrap.Modal(document.getElementById("marModal")).show();
}

// Opens the MAR modal in view-only mode.
function viewMARRecord(recordIndex) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;
  const record = patient.marRecords[recordIndex];
  if (!record) return;

  // Populate the view section with record data.
  document.getElementById("viewMarPatientName").textContent = patient.name || "";
  document.getElementById("viewMarRoomNo").textContent = record.roomNo || "num";
  document.getElementById("viewMarDrug").textContent = record.drug || "";
  document.getElementById("viewMarDose").textContent = record.dose || "";
  document.getElementById("viewMarRoute").textContent = record.route || "";
  document.getElementById("viewMarTime").textContent = record.time || "";
  document.getElementById("viewMarNurseDoctor").textContent = record.nurseDoctor || "";

  // Hide the editable section and show the view section.
  document.getElementById("marEditSection").style.display = "none";
  document.getElementById("marViewSection").style.display = "block";

  // Hide action buttons in view mode.
  document.getElementById("marSaveBtn").style.display = "none";
  document.getElementById("marDeleteBtn").style.display = "none";

  // Set hidden index.
  document.getElementById("marIndex").value = recordIndex;

  new bootstrap.Modal(document.getElementById("marModal")).show();
}

async function saveMARRecord() {
    const indexVal = document.getElementById("marIndex").value;
    const drug = document.getElementById("marDrug").value.trim();
    const record = {
      roomNo: document.getElementById("marRoomNo").value,
      drug,
      dose: document.getElementById("marDose").value,
      route: document.getElementById("marRoute").value,
      time: document.getElementById("marTime").value,
      nurseDoctor: document.getElementById("marNurseDoctor").value
    };

    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);
    if (!patient) return;
    if (!patient.marRecords) patient.marRecords = [];

    if (indexVal === "") {
      patient.marRecords.push(record);
    } else {
      patient.marRecords[indexVal] = record;
    }

    await db.patients.put(patient);

    // 🔄 Trigger alert logic here
    await checkMARAllergyConflict(drug);

    loadMARRecordsDisplay();
    bootstrap.Modal.getInstance(document.getElementById("marModal")).hide();
    showAlert("MAR record saved successfully!", "success");
  }


async function deleteMARRecord(index) {
  if (!confirm("Are you sure you want to delete this MAR record?")) return;

  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient || !patient.marRecords) return;

  patient.marRecords.splice(index, 1);
  await db.patients.put(patient);
  loadMARRecordsDisplay();
  bootstrap.Modal.getInstance(document.getElementById("marModal")).hide();
  showAlert("MAR record deleted successfully!", "success");
}

function loadMARRecordsDisplay() {
  const container = document.getElementById("marRecordsContainer");
  container.innerHTML = "";
  const patient = getPatients().find(p => p.id === currentPatientIndex);

  if (patient && patient.marRecords && patient.marRecords.length > 0) {
    let html = `
      <div class="table-responsive">
        <table class="table table-striped table-bordered">
          <thead class="table-dark">
            <tr>
              <th>Date/Time</th>
              <th>Drug Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>`;
    // Sort records by date in descending order
    const sortedRecords = [...patient.marRecords].sort((a, b) => new Date(b.time) - new Date(a.time));

    sortedRecords.forEach((record) => {
      const originalIndex = patient.marRecords.indexOf(record);
      const formattedDate = record.time ? new Date(record.time).toLocaleString() : "—";
      html += `
        <tr>
          <td data-label="Date/Time">${formattedDate}</td>
          <td data-label="Drug Name">${record.drug || "—"}</td>
          <td data-label="Actions">
            ${createActionButton('view', `viewMARRecord(${originalIndex})`)}
            ${createActionButton('edit', `openMARModal(${originalIndex})`)}
            ${createActionButton('delete', `deleteMARRecord(${originalIndex})`)}
          </td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } else {
    container.innerHTML = `<p class="text-muted">No MAR records available.</p>`;
  }
}


async function checkMARAllergyConflict(drugInput) {
    if (!drugInput) return;

    const patients = getPatients();
    const patient = patients.find(p => p.id === currentPatientIndex);
    if (!patient || !patient.nursingHistoryRecords) return;

    // Split drugs by newline and clean up
    const drugs = drugInput.split('\n')
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0);

    // Get all allergies from nursing history
    const allergies = patient.nursingHistoryRecords
        .map(record => record.allergies)
        .filter(allergies => allergies)
        .join('\n')
        .split('\n')
        .map(a => a.trim().toLowerCase())
        .filter(a => a.length > 0);

    // Check each drug against allergies
    for (const drug of drugs) {
        for (const allergy of allergies) {
            if (drug.includes(allergy)) {
                const alert = {
                    type: "Medication Dosing Alert",
                    description: `Allergy conflict detected: ${allergy} is in MAR record`,
                    createdAt: new Date().toISOString()
                };

                if (!patient.dosingAlertsRecords) {
                    patient.dosingAlertsRecords = [];
                }

                // Check if this exact alert already exists
                const existingAlert = patient.dosingAlertsRecords.find(a =>
                    a.type === alert.type &&
                    a.description === alert.description
                );

                if (!existingAlert) {
                    patient.dosingAlertsRecords.push(alert);
                    await db.patients.put(patient);
                    showNotificationAlert(`Alert: ${allergy} allergy conflict with MAR record`, "warning");
                }
            }
        }
    }
}


/*********************************************************
  APPOINTMENT CRUD FUNCTIONS
**********************************************************/
function openAppointmentForm() {
  document.getElementById("appointmentIndex").value = "";
  document.getElementById("appointmentDate").value = "";
  document.getElementById("appointmentTime").value = "";
  document.getElementById("appointmentContact").value = "";
  document.getElementById("appointmentWard").value = "";
  document.getElementById("appointmentDate").disabled = false;
  document.getElementById("appointmentTime").disabled = false;
  document.getElementById("appointmentContact").disabled = false;
  document.getElementById("appointmentWard").disabled = false;
  document.getElementById("appointmentSaveBtn").style.display = "inline-block";
  document.getElementById("appointmentDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function loadAppointmentTable() {
  const tableBody = document.getElementById("appointmentTableBody");
  tableBody.innerHTML = "";
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex) || {};
  let count = 0;
  if (patient.appointmentRecords) {
    patient.appointmentRecords.forEach((record, index) => {
      count++;
      tableBody.innerHTML += `
        <tr>
          <td>${record.date}</td>
          <td>${record.time || ""}</td>
          <td>${record.contact || ""}</td>
          <td>${record.ward || ""}</td>
          <td>
${createActionButton('view', `viewAppointmentRecord(${index})`)}
${createActionButton('edit', `editAppointmentRecord(${index})`)}
${createActionButton('delete', `deleteAppointmentRecord(${index})`)}

          </td>
        </tr>`;
    });
  }
  document.getElementById("emptyAppointment").style.display = count === 0 ? "block" : "none";
}

function saveAppointmentRecord() {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  if (!patient.appointmentRecords) patient.appointmentRecords = [];
  const indexVal = document.getElementById("appointmentIndex").value;
  const dateVal = document.getElementById("appointmentDate").value;
  const timeVal = document.getElementById("appointmentTime").value;
  const contactVal = document.getElementById("appointmentContact").value;
  const wardVal = document.getElementById("appointmentWard").value;
  if (indexVal === "") {
    patient.appointmentRecords.push({ date: dateVal, time: timeVal, contact: contactVal, ward: wardVal });
  } else {
    patient.appointmentRecords[indexVal] = { date: dateVal, time: timeVal, contact: contactVal, ward: wardVal };
  }
  db.patients.put(patient).then(() => {
    loadAppointmentTable();
    bootstrap.Modal.getInstance(document.getElementById("appointmentModal")).hide();
  });
}

function viewAppointmentRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.appointmentRecords[index];
  if (!record) return;
  document.getElementById("appointmentIndex").value = index;
  document.getElementById("appointmentDate").value = record.date;
  document.getElementById("appointmentTime").value = record.time || "";
  document.getElementById("appointmentContact").value = record.contact || "";
  document.getElementById("appointmentWard").value = record.ward || "";
  document.getElementById("appointmentDate").disabled = true;
  document.getElementById("appointmentTime").disabled = true;
  document.getElementById("appointmentContact").disabled = true;
  document.getElementById("appointmentWard").disabled = true;
  document.getElementById("appointmentSaveBtn").style.display = "none";
  document.getElementById("appointmentDeleteBtn").style.display = "none";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function editAppointmentRecord(index) {
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  const record = patient.appointmentRecords[index];
  if (!record) return;
  document.getElementById("appointmentIndex").value = index;
  document.getElementById("appointmentDate").value = record.date;
  document.getElementById("appointmentTime").value = record.time || "";
  document.getElementById("appointmentContact").value = record.contact || "";
  document.getElementById("appointmentWard").value = record.ward || "";
  document.getElementById("appointmentDate").disabled = false;
  document.getElementById("appointmentTime").disabled = false;
  document.getElementById("appointmentContact").disabled = false;
  document.getElementById("appointmentWard").disabled = false;
  document.getElementById("appointmentSaveBtn").style.display = "inline-block";
  document.getElementById("appointmentDeleteBtn").style.display = "inline-block";
  new bootstrap.Modal(document.getElementById("appointmentModal")).show();
}

function deleteAppointmentRecord(index) {
  if (!confirm("Are you sure you want to delete this appointment?")) return;
  const patients = getPatients();
  const patient = patients.find(p => p.id === currentPatientIndex);
  patient.appointmentRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadAppointmentTable();
    bootstrap.Modal.getInstance(document.getElementById("appointmentModal")).hide();
  });
}

/*********************************************************
  IMAGE HANDLING FUNCTIONS
**********************************************************/
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderEditableImages() {
  const container = document.getElementById("newImagesContainer");
  container.innerHTML = "";
  container.style.display = "flex";
  currentUploadImages.forEach((imgObj, index) => {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";
    wrapper.style.marginRight = "10px";

    const img = document.createElement("img");
    img.src = imgObj.src;
    img.alt = "Test Image";
    img.style.width = "100px";
    img.style.height = "100px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "4px";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "0";
    removeBtn.style.right = "0";
    removeBtn.style.backgroundColor = "red";
    removeBtn.style.color = "#fff";
    removeBtn.style.border = "none";
    removeBtn.style.borderRadius = "50%";
    removeBtn.style.cursor = "pointer";
    removeBtn.onclick = () => {
      currentUploadImages.splice(index, 1);
      renderEditableImages();
    };

    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.placeholder = "Add note...";
    noteInput.value = imgObj.note;
    noteInput.style.display = "block";
    noteInput.style.marginTop = "5px";
    noteInput.style.width = "90px";
    noteInput.oninput = e => {
      currentUploadImages[index].note = e.target.value;
    };

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    wrapper.appendChild(noteInput);
    container.appendChild(wrapper);
  });
}

function removePicture(index) {
  currentUploadImages.splice(index, 1);
  renderEditableImages();
}

function renderViewImages(images) {
  const container = document.getElementById("viewTestImageContainer");
  container.innerHTML = "";
  if (images && images.length > 0) {
    container.style.display = "flex";
    images.forEach(imgObj => {
      const wrapper = document.createElement("div");
      wrapper.style.marginRight = "10px";
      wrapper.style.textAlign = "center";

      const img = document.createElement("img");
      img.src = imgObj.src;
      img.alt = "Test Image";
      img.style.width = "100px";
      img.style.height = "100px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "4px";
      // Optionally, click the image to view it in full size
      img.onclick = () => {
        viewFullImage(imgObj.src, imgObj.note);
      };

      const note = document.createElement("div");
      note.textContent = imgObj.note;
      note.style.fontSize = "0.8rem";
      note.style.color = "#555";

      wrapper.appendChild(img);
      wrapper.appendChild(note);
      container.appendChild(wrapper);
    });
  } else {
    container.style.display = "none";
  }
}

function viewFullImage(src, note = "") {
  const fullImg = document.getElementById("fullImageView");
  const fullNote = document.getElementById("fullImageNote");
  fullImg.src = src;
  fullNote.textContent = note;
  const modal = new bootstrap.Modal(document.getElementById("fullImageModal"));
  modal.show();
}

/*********************************************************
  DOM CONTENT LOADED
**********************************************************/
document.addEventListener("DOMContentLoaded", () => {
  loadPatients();
  document.getElementById("addPatientForm").addEventListener("submit", addPatient);
  document.getElementById("editPatientForm").addEventListener("submit", updatePatient);
});

/*********************************************************
  FILE INPUT HANDLING
**********************************************************/
function triggerAddPicture() {
  const fileInput = document.getElementById("singleTestImage");
  fileInput.value = ""; // clear previous selection
  fileInput.click();
}

document.getElementById("singleTestImage").addEventListener("change", async function() {
  if (this.files && this.files.length > 0) {
    // Loop over all selected files so you can add multiple images at once
    for (let file of this.files) {
      try {
        const base64 = await readFileAsDataURL(file);
        // Add the new image with an empty note by default
        currentUploadImages.push({ src: base64, note: "" });
      } catch (err) {
        console.error("Error reading file:", err);
      }
    }
    // Re-render the editable images container with all selected images
    renderEditableImages();
  }
});

function showAlert(message, type) {
  // Create alert div
  const alertDiv = document.createElement("div");
  alertDiv.classList.add("custom-alert");
  alertDiv.classList.add(type === "success" ? "alert-success" : "alert-error");
  alertDiv.textContent = message;

  // Optionally, add a shake animation for errors
  if (type === "error") {
    alertDiv.classList.add("shake");
  }

  // Append alert to body
  document.body.appendChild(alertDiv);

  // Remove alert after 2 seconds
  setTimeout(() => {
    alertDiv.remove();
  }, 2000);
}
/*********************************************************
  LOAD CDSS ALERTS (for all three sub-tabs)
**********************************************************/
function loadCdssAlerts() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;

  // Clear table bodies for CDSS, Practice, and Registry tabs
  document.getElementById("cdssAlertTableBody").innerHTML = "";
  document.getElementById("practiceAlertTableBody").innerHTML = "";
  document.getElementById("registryAlertTableBody").innerHTML = "";

  let cdssCount = 0, practiceCount = 0, registryCount = 0;

  if (patient.cdssAlertsRecords && patient.cdssAlertsRecords.length > 0) {
    patient.cdssAlertsRecords.forEach((alertRecord, index) => {
      const tr = document.createElement("tr");
      if (alertRecord.category === "cdss") {
        cdssCount++;
        // For CDSS alerts, display only the alert type
        const tdType = document.createElement("td");
        tdType.textContent = alertRecord.type;
        tr.appendChild(tdType);
        // Actions column: View, Edit, Suppress, Delete
        const tdActions = document.createElement("td");
        tdActions.innerHTML = `
<button class="btn btn-info btn-sm" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">View</button>
<button class="btn btn-primary btn-sm" style="background-color: #007bff; border: none; color: white;" onclick="editCdssAlert(${index})">Edit</button>
<button class="btn btn-warning btn-sm" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">Suppress</button>
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">Delete</button>

        `;
        tr.appendChild(tdActions);
        document.getElementById("cdssAlertTableBody").appendChild(tr);
      } else if (alertRecord.category === "practice") {
        practiceCount++;
        // For practice alerts, show type and due date (and indicator if needed)
        let td = document.createElement("td");
        td.textContent = alertRecord.type;
        tr.appendChild(td);
        td = document.createElement("td");
        td.textContent = alertRecord.dateWhenDue || "";
        tr.appendChild(td);
        // (Optional: show indicator as colored box)
        td = document.createElement("td");
        td.innerHTML = `<button class="btn btn-outline-secondary btn-sm" onclick="viewDueDate(${index}, 'practice')">
                          <div style="width:20px; height:20px; background-color:${alertRecord.indicator || 'gray'};"></div>
                        </button>`;
        tr.appendChild(td);
        td = document.createElement("td");
        td.innerHTML = `
<button class="btn btn-info btn-sm" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">View</button>
<button class="btn btn-warning btn-sm" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">Suppress</button>
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">Delete</button>

        `;
        tr.appendChild(td);
        document.getElementById("practiceAlertTableBody").appendChild(tr);
      } else if (alertRecord.category === "registry") {
        registryCount++;
        let td = document.createElement("td");
        td.textContent = alertRecord.type;
        tr.appendChild(td);
        td = document.createElement("td");
        td.innerHTML = `
<button class="btn btn-info btn-sm" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">View</button>
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">Delete</button>

        `;
        tr.appendChild(td);
        document.getElementById("registryAlertTableBody").appendChild(tr);
      }
    });
  }

  // Toggle empty messages
  document.getElementById("emptyCdssAlert").style.display = cdssCount === 0 ? "block" : "none";
  document.getElementById("emptyPracticeAlert").style.display = practiceCount === 0 ? "block" : "none";
  document.getElementById("emptyRegistryAlert").style.display = registryCount === 0 ? "block" : "none";
}

/*********************************************************
  SUPPRESSION MODAL FUNCTIONS
**********************************************************/
function openSuppressionModal(index, category) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;

  const alertRecord = patient.cdssAlertsRecords[index];
  if (!alertRecord) return;

  // Set modal title and display current suppression info
  document.getElementById("suppressionModalTitle").textContent = `Suppress Alert: ${alertRecord.type}`;
  document.getElementById("currentDueDate").innerHTML = alertRecord.untilWhen
    ? `<small class="text-muted">Current Suppression Days: ${alertRecord.untilWhen}</small>`
    : `<small class="text-muted">No suppression set.</small>`;

  // Clear the input field for suppression days
  document.getElementById("suppressDaysInput").value = "";

  // Bind the "Apply Suppression" button
  document.getElementById("applySuppressionBtn").onclick = function() {
    applySuppression(index, category);
  };

  // Bind the "Never Remind" button
  document.getElementById("neverRemindBtn").onclick = function() {
    alertRecord.untilWhen = chosenInterval;
    alertRecord.suppressed = chosenInterval ? true : false;
    db.patients.put(patient).then(() => {
      loadCdssAlerts();
      bootstrap.Modal.getInstance(document.getElementById("suppressionModal")).hide();
    });
  };

  new bootstrap.Modal(document.getElementById("suppressionModal")).show();
}

function applySuppression(index, /* category */) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;
  const alertRecord = patient.cdssAlertsRecords[index];
  const days = parseInt(document.getElementById("suppressDaysInput").value, 10);
  if (isNaN(days)) {
    window.alert("Please enter a valid number of days.");
    return;
  }
  alertRecord.untilWhen = days; // store suppression days
  alertRecord.suppressed = true;
  // Set indicator based on threshold: >=90 red; below 90 blue
  alertRecord.indicator = days >= 90 ? "red" : "blue";
  db.patients.put(patient).then(() => {
    loadCdssAlerts();
    bootstrap.Modal.getInstance(document.getElementById("suppressionModal")).hide();
  });
}

// Function to unsuppress an alert
function unsuppressAlert(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;

  const alertRecord = patient.cdssAlertsRecords[index];
  if (!alertRecord) return;

  // Store alert type for feedback message
  const alertType = alertRecord.type || "Alert";

  // Reset suppression values
  alertRecord.untilWhen = "";
  alertRecord.suppressed = false;
  alertRecord.suppressReasonType = "";
  alertRecord.suppressReason = "";

  try {
    // Save changes to database
    db.patients.put(patient).then(() => {
      // Refresh alerts display
      loadCdssAlerts();
      updateAlertsBadge();
      loadNotifications();

      // Show success message with alert type
      showAlert(`${alertType} has been unsuppressed and is now active!`, "success");

      // Close any open modals
      const viewModal = document.getElementById('viewAlertModal');
      if (viewModal) {
        const bsModal = bootstrap.Modal.getInstance(viewModal);
        if (bsModal) bsModal.hide();
      }
    }).catch(error => {
      console.error("Error unsuppressing alert:", error);
      showAlert("Error unsuppressing alert: " + error.message, "error");
    });
  } catch (error) {
    console.error("Error in unsuppressAlert function:", error);
    showAlert("Error unsuppressing alert: " + error.message, "error");
  }
}

/*********************************************************
  VIEW ALERT FUNCTIONS (using modal)
**********************************************************/
function viewCdssAlert(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) {
    console.error("No patient or alerts found.");
    return;
  }
  if (index < 0 || index >= patient.cdssAlertsRecords.length) {
    console.error("Invalid alert index.");
    return;
  }
  const alertRecord = patient.cdssAlertsRecords[index];
  if (!alertRecord) return;

  // Prepare the alert type display with suppression badge if applicable
  let alertTypeDisplay = alertRecord.type || "";
  if (alertRecord.suppressed) {
    alertTypeDisplay = `${alertRecord.type || ""} <span class="badge bg-secondary">Suppressed</span>`;
  }
  document.getElementById("viewAlertType").innerHTML = alertTypeDisplay;

  // For CDSS alerts: show type and suppression details
  if (alertRecord.category === "cdss") {
    // Show suppression information
    document.getElementById("viewAlertUntil").textContent = alertRecord.untilWhen || "Not set";
    document.getElementById("viewAlertReason").textContent = alertRecord.suppressReasonType || "";
    document.getElementById("viewAlertReasonText").textContent = alertRecord.suppressReason || "";

    // Clear fields not needed for CDSS
    document.getElementById("viewAlertDueDate").textContent = "";
    document.getElementById("viewAlertIndicator").innerHTML = "";
  }
  // For Practice alerts: show type, due date, indicator, and suppression details
  else if (alertRecord.category === "practice") {
    document.getElementById("viewAlertDueDate").textContent = alertRecord.dateWhenDue || "";

    // Create a colored indicator box based on the indicator value
    const indicatorColor = alertRecord.indicator === "blue" ? "#007bff" :
                          alertRecord.indicator === "red" ? "#dc3545" :
                          alertRecord.indicator || "#cccccc";
    document.getElementById("viewAlertIndicator").innerHTML =
      `<div style="width:20px; height:20px; background-color:${indicatorColor}; border-radius:3px;"></div>`;

    // Show suppression information
    document.getElementById("viewAlertUntil").textContent = alertRecord.untilWhen || "Not set";
    document.getElementById("viewAlertReason").textContent = alertRecord.suppressReasonType || "";
    document.getElementById("viewAlertReasonText").textContent = alertRecord.suppressReason || "";
  }
  // For Registry alerts: show type and suppression details
  else if (alertRecord.category === "registry") {
    // Show suppression information if suppressed
    if (alertRecord.suppressed) {
      document.getElementById("viewAlertUntil").textContent = alertRecord.untilWhen || "Not set";
      document.getElementById("viewAlertReason").textContent = alertRecord.suppressReasonType || "";
      document.getElementById("viewAlertReasonText").textContent = alertRecord.suppressReason || "";
    } else {
      document.getElementById("viewAlertUntil").textContent = "";
      document.getElementById("viewAlertReason").textContent = "";
      document.getElementById("viewAlertReasonText").textContent = "";
    }

    // Clear fields not needed for Registry alerts
    document.getElementById("viewAlertDueDate").textContent = "";
    document.getElementById("viewAlertIndicator").innerHTML = "";
  }

  // Prepare footer buttons based on alert state
  let footerButtons = '';

  // Add Edit button for all alert types
  if (alertRecord.category === "cdss") {
    footerButtons += `<button class="btn btn-primary me-2" onclick="editCdssAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-pencil-fill me-1"></i> Edit
    </button>`;
  } else if (alertRecord.category === "practice") {
    footerButtons += `<button class="btn btn-primary me-2" onclick="editPracticeAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-pencil-fill me-1"></i> Edit
    </button>`;
  } else if (alertRecord.category === "registry") {
    footerButtons += `<button class="btn btn-primary me-2" onclick="editRegistryAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-pencil-fill me-1"></i> Edit
    </button>`;
  }

  // Add Suppress/Unsuppress button based on current state
  if (alertRecord.suppressed) {
    footerButtons = `<button class="btn btn-success me-2" onclick="unsuppressAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-bell-fill me-1"></i> Unsuppress
    </button>` + footerButtons;
  } else {
    footerButtons = `<button class="btn btn-warning me-2" onclick="openSuppressModal(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-bell-slash-fill me-1"></i> Suppress
    </button>` + footerButtons;
  }

  // Add Close button
  footerButtons += `<button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;

  document.getElementById("viewAlertModalFooter").innerHTML = footerButtons;

  new bootstrap.Modal(document.getElementById("viewAlertModal")).show();
}

// For Practice Created alerts (shows extra fields)
function viewPracticeAlert(index) {
  // Use the main viewCdssAlert function which now handles all alert types
  viewCdssAlert(index);
}

// For Registry alerts (only show type, with edit option)
function viewRegistryAlert(index) {
  // Use the main viewCdssAlert function which now handles all alert types
  viewCdssAlert(index);
}

async function deleteCdssAlert(index) {
  if (!confirm("Are you sure you want to delete this alert?")) return;

  try {
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      showAlert("Patient or alerts not found", "error");
      return;
    }

    // Get the alert before deleting it (for logging purposes)
    const alertToDelete = patient.cdssAlertsRecords[index];
    console.log("Deleting alert:", alertToDelete);

    // Remove the alert
    patient.cdssAlertsRecords.splice(index, 1);

    // Save the updated patient data
    await db.patients.put(patient);

    // Refresh the alerts display
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();

    // Show success message
    showAlert("Alert deleted successfully", "success");

    // Close any open alert modals
    const viewModal = bootstrap.Modal.getInstance(document.getElementById("viewAlertModal"));
    if (viewModal) viewModal.hide();
  } catch (error) {
    console.error("Error deleting alert:", error);
    showAlert("Error deleting alert: " + (error.message || "Unknown error"), "error");
  }
}

/*********************************************************
  ADD/EDIT ALERT FORM FUNCTIONS
**********************************************************/
function openCdssAlertForm(category) {
// Set the hidden category input
document.getElementById("alertCategory").value = category;

// For practice alerts, show due date container; for CDSS, hide it.
document.getElementById("dateWhenDueContainer").style.display = category === "practice" ? "block" : "none";

// Clear form fields
document.getElementById("alertTypeInput").value = "";
document.getElementById("alertDueDateInput").value = "";

new bootstrap.Modal(document.getElementById("cdssAlertFormModal")).show();
}


function saveCdssAlertForm() {
  const alertType = document.getElementById("alertTypeInput").value.trim();
  if (!alertType) {
    alert("Please enter an alert type.");
    return;
  }

  const category = document.getElementById("alertCategory").value;
  let dateWhenDue = "";
  if (category === "practice") {
    dateWhenDue = document.getElementById("alertDueDateInput").value;
  }

  // Create a new alert (unsuppressed by default)
  const newAlert = {
    type: alertType,
    category: category,
    dateWhenDue: dateWhenDue,
    dueDate: "",    // Optional for CDSS-specific due date if needed
    untilWhen: "",
    suppressed: false  // Must be false so it appears in notifications
  };

  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;
  if (!patient.cdssAlertsRecords) {
    patient.cdssAlertsRecords = [];
  }

  patient.cdssAlertsRecords.push(newAlert);

  db.patients.put(patient).then(() => {
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();
    bootstrap.Modal.getInstance(document.getElementById("cdssAlertFormModal")).hide();
    showAlert("Alert added successfully!", "success");
  });
}
/*********************************************************
  LOAD CDSS ALERTS (for all three sub-tabs)
**********************************************************/
function loadCdssAlerts() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;

  // Clear table bodies for all three sub-tabs
  document.getElementById("cdssAlertTableBody").innerHTML = "";
  document.getElementById("practiceAlertTableBody").innerHTML = "";
  document.getElementById("registryAlertTableBody").innerHTML = "";

  let cdssCount = 0, practiceCount = 0, registryCount = 0;

  if (patient.cdssAlertsRecords && patient.cdssAlertsRecords.length > 0) {
    patient.cdssAlertsRecords.forEach((alertRecord, index) => {
      const tr = document.createElement("tr");

      if (alertRecord.category === "cdss") {
        cdssCount++;
        // === CDSS row ===
        // 1) Type column
        let tdType = document.createElement("td");
        tdType.textContent = alertRecord.type;

        // Add a visual indicator if the alert is suppressed
        if (alertRecord.suppressed) {
          const suppressBadge = document.createElement("span");
          suppressBadge.className = "badge bg-secondary ms-2";
          suppressBadge.textContent = "Suppressed";
          suppressBadge.style.fontSize = "0.7rem";
          tdType.appendChild(suppressBadge);
        }

        tr.appendChild(tdType);

        // 2) Actions column: includes View, Edit, Suppress/Unsuppress, Delete
        let tdActions = document.createElement("td");

        // Always show View and Edit buttons
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editCdssAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Show either Suppress or Unsuppress button based on current state
        if (alertRecord.suppressed) {
          buttonsHtml += `
<button class="btn btn-success btn-sm me-1" style="background-color: #28a745; border: none; color: white;" onclick="unsuppressAlert(${index})">
  <i class="bi bi-bell-fill me-1"></i> Unsuppress
</button>`;
        } else {
          buttonsHtml += `
<button class="btn btn-warning btn-sm me-1" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">
  <i class="bi bi-bell-slash-fill me-1"></i> Suppress
</button>`;
        }

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        tdActions.innerHTML = buttonsHtml;
        tr.appendChild(tdActions);

        document.getElementById("cdssAlertTableBody").appendChild(tr);
      }
      else if (alertRecord.category === "practice") {
        practiceCount++;
        // === Practice row ===
        // 1) Type
        let td = document.createElement("td");
        td.textContent = alertRecord.type;

        // Add a visual indicator if the alert is suppressed
        if (alertRecord.suppressed) {
          const suppressBadge = document.createElement("span");
          suppressBadge.className = "badge bg-secondary ms-2";
          suppressBadge.textContent = "Suppressed";
          suppressBadge.style.fontSize = "0.7rem";
          td.appendChild(suppressBadge);
        }

        tr.appendChild(td);

        // 2) Due Date
        td = document.createElement("td");
        td.textContent = alertRecord.dateWhenDue || "";
        tr.appendChild(td);

        // 3) Indicator
        td = document.createElement("td");
        td.innerHTML = `
<button class="btn btn-outline-secondary btn-sm" style="border: 1px solid #6c757d;" onclick="viewDueDate(${index}, 'practice')">
    <div style="width: 20px; height: 20px; background-color: ${alertRecord.indicator || 'gray'};"></div>
</button>
        `;
        tr.appendChild(td);

        // 4) Actions
        td = document.createElement("td");

        // Always show View button
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>`;

        // Add Edit button
        buttonsHtml += `
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editPracticeAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Show either Suppress or Unsuppress button based on current state
        if (alertRecord.suppressed) {
          buttonsHtml += `
<button class="btn btn-success btn-sm me-1" style="background-color: #28a745; border: none; color: white;" onclick="unsuppressAlert(${index})">
  <i class="bi bi-bell-fill me-1"></i> Unsuppress
</button>`;
        } else {
          buttonsHtml += `
<button class="btn btn-warning btn-sm me-1" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">
  <i class="bi bi-bell-slash-fill me-1"></i> Suppress
</button>`;
        }

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        td.innerHTML = buttonsHtml;
        tr.appendChild(td);

        document.getElementById("practiceAlertTableBody").appendChild(tr);
      }
      else if (alertRecord.category === "registry") {
        registryCount++;
        // === Registry row ===
        // 1) Type
        let td = document.createElement("td");
        td.textContent = alertRecord.type;

        // Add a visual indicator if the alert is suppressed
        if (alertRecord.suppressed) {
          const suppressBadge = document.createElement("span");
          suppressBadge.className = "badge bg-secondary ms-2";
          suppressBadge.textContent = "Suppressed";
          suppressBadge.style.fontSize = "0.7rem";
          td.appendChild(suppressBadge);
        }

        tr.appendChild(td);

        // 2) Actions column with suppression functionality
        td = document.createElement("td");

        // Always show View button
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>`;

        // Add Edit button
        buttonsHtml += `
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editRegistryAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Show either Suppress or Unsuppress button based on current state
        if (alertRecord.suppressed) {
          buttonsHtml += `
<button class="btn btn-success btn-sm me-1" style="background-color: #28a745; border: none; color: white;" onclick="unsuppressAlert(${index})">
  <i class="bi bi-bell-fill me-1"></i> Unsuppress
</button>`;
        } else {
          buttonsHtml += `
<button class="btn btn-warning btn-sm me-1" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">
  <i class="bi bi-bell-slash-fill me-1"></i> Suppress
</button>`;
        }

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        td.innerHTML = buttonsHtml;
        tr.appendChild(td);

        document.getElementById("registryAlertTableBody").appendChild(tr);
      }
    });
  }

  // Toggle empty messages if no alerts exist
  document.getElementById("emptyCdssAlert").style.display = cdssCount === 0 ? "block" : "none";
  document.getElementById("emptyPracticeAlert").style.display = practiceCount === 0 ? "block" : "none";
  document.getElementById("emptyRegistryAlert").style.display = registryCount === 0 ? "block" : "none";
}

/*********************************************************
  ADD ALERT FORM (unchanged, but includes "dueDate" for practice)
**********************************************************/
function openCdssAlertForm(category) {
  // Set the hidden category input
  document.getElementById("alertCategory").value = category;

  // Show/hide fields based on alert category
  if (category === "practice") {
    // For practice alerts, show due date and indicator
    document.getElementById("dateWhenDueContainer").style.display = "block";
    document.getElementById("indicatorContainer").style.display = "none"; // Hide the indicator field as it's auto-calculated
  } else {
    // For CDSS and registry alerts, hide due date and indicator
    document.getElementById("dateWhenDueContainer").style.display = "none";
    document.getElementById("indicatorContainer").style.display = "none";
  }

  // Clear form fields
  document.getElementById("alertTypeInput").value = "";
  document.getElementById("alertIndicatorInput").value = "red";
  document.getElementById("alertDueDateInput").value = "";

  // Update modal title based on category
  const modalTitle = document.getElementById("cdssAlertFormModalTitle");
  if (category === "cdss") {
    modalTitle.textContent = "Add CDSS Alert";
  } else if (category === "practice") {
    modalTitle.textContent = "Add Practice Created Alert";
  } else if (category === "registry") {
    modalTitle.textContent = "Add Registry Alert";
  }

  new bootstrap.Modal(document.getElementById("cdssAlertFormModal")).show();
}

function saveCdssAlertForm() {
  const alertType = document.getElementById("alertTypeInput").value.trim();
  if (!alertType) {
    alert("Please enter an alert type.");
    return;
  }

  const category = document.getElementById("alertCategory").value;
  let dateWhenDue = "";
  let indicator = "";

  if (category === "practice") {
    dateWhenDue = document.getElementById("alertDueDateInput").value;

    // If due date is provided, calculate indicator color based on days from today
    if (dateWhenDue) {
      const today = new Date();
      const dueDate = new Date(dateWhenDue);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Blue indicator for less than 90 days from today
      // Red indicator for greater than or equal to 90 days from today
      indicator = diffDays < 90 ? "blue" : "red";
    } else {
      // Default to red if no due date is provided
      indicator = "red";
    }
  }

  const newAlert = {
    type: alertType,
    category: category,
    dateWhenDue: dateWhenDue,
    dueDate: "",     // optional for CDSS-specific due date
    untilWhen: "",
    suppressed: false,
    indicator: indicator // Add the indicator based on due date
  };

  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;
  if (!patient.cdssAlertsRecords) patient.cdssAlertsRecords = [];
  patient.cdssAlertsRecords.push(newAlert);

  db.patients.put(patient).then(() => {
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();
    bootstrap.Modal.getInstance(document.getElementById("cdssAlertFormModal")).hide();
    showAlert("Alert added successfully!", "success");
  });
}

/*********************************************************
  VIEW ALERT (For all alert types with specific fields for each)
**********************************************************/
function viewCdssAlert(index) {
  try {
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      console.error("No patient or alerts found.");
      return;
    }
    if (index < 0 || index >= patient.cdssAlertsRecords.length) {
      console.error("Invalid alert index.");
      return;
    }
    const alertRecord = patient.cdssAlertsRecords[index];
    if (!alertRecord) {
      console.error("Alert record not found.");
      return;
    }

    // Get all the elements we need to work with
    const patientInfoEl = document.getElementById("viewAlertPatientInfo");
    const typeEl = document.getElementById("viewAlertType");
    const allergiesContainerEl = document.getElementById("viewAlertAllergiesContainer");
    const allergiesEl = document.getElementById("viewAlertAllergies");
    const dueDateContainerEl = document.getElementById("viewAlertDueDateContainer");
    const dueDateEl = document.getElementById("viewAlertDueDate");
    const indicatorContainerEl = document.getElementById("viewAlertIndicatorContainer");
    const indicatorEl = document.getElementById("viewAlertIndicator");
    const suppressionContainerEl = document.getElementById("viewAlertSuppressionStatusContainer");
    const untilEl = document.getElementById("viewAlertUntil");

    // Set patient info
    if (patientInfoEl) patientInfoEl.textContent = `${patient.patientId} - ${patient.name}`;

    // Hide all specific field containers by default
    if (allergiesContainerEl) allergiesContainerEl.style.display = "none";
    if (dueDateContainerEl) dueDateContainerEl.style.display = "none";
    if (indicatorContainerEl) indicatorContainerEl.style.display = "none";
    if (suppressionContainerEl) suppressionContainerEl.style.display = "none";

    // Common field for all alert types: Alert Type
    if (typeEl) typeEl.textContent = alertRecord.type || "";

    // SPECIFIC FIELDS FOR EACH ALERT TYPE

    // 1. For Medication Alert: show ONLY Allergies field prominently
    if (alertRecord.type && alertRecord.type.includes("Medication")) {
      // Get allergies from nursing history if available
      let allergiesText = "—";
      if (patient.nursingHistoryRecords && patient.nursingHistoryRecords.length > 0) {
        const allergies = patient.nursingHistoryRecords
          .map(record => record.allergies)
          .filter(allergies => allergies)
          .join(", ");

        if (allergies) {
          allergiesText = allergies;
        }
      }
      if (allergiesEl) allergiesEl.textContent = allergiesText;
      if (allergiesContainerEl) allergiesContainerEl.style.display = "block";
    }
    // 2. For CDSS Alert: show ONLY Alert Type and Suppression status
    else if (alertRecord.category === "cdss") {
      // Show Alert Type (already shown above)

      // Always show Suppression status for CDSS alerts
      if (untilEl) untilEl.textContent = alertRecord.suppressed ? alertRecord.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 3. For Practice Created Alert: show ONLY Alert Type, Due Date, Indicator, and Suppression status
    else if (alertRecord.category === "practice") {
      // Show Alert Type (already shown above)

      // Show Due Date
      if (dueDateEl) dueDateEl.textContent = alertRecord.dateWhenDue || "";
      if (dueDateContainerEl) dueDateContainerEl.style.display = "block";

      // Show Indicator with appropriate color
      const indicatorColor = alertRecord.indicator === "blue" ? "#007bff" :
                            alertRecord.indicator === "red" ? "#dc3545" :
                            "#cccccc"; // Default to light gray if not set

      if (indicatorEl) indicatorEl.innerHTML =
        `<div style="width:20px; height:20px; background-color:${indicatorColor}; border-radius:3px; display:inline-block; vertical-align:middle;"></div>`;
      if (indicatorContainerEl) indicatorContainerEl.style.display = "block";

      // Always show Suppression status for Practice alerts
      if (untilEl) untilEl.textContent = alertRecord.suppressed ? alertRecord.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 4. For Registry Alert: show ONLY Alert Type
    else if (alertRecord.category === "registry") {
      // Show Alert Type (already shown above)
      // No other fields should be shown
    }

    // Prepare footer buttons based on alert type
    let footerButtons = '';

    // Add Edit button for all alert types
    if (alertRecord.category === "cdss") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editCdssAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (alertRecord.category === "practice") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editPracticeAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (alertRecord.category === "registry") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editRegistryAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    }

    // Add Suppress/Unsuppress button based on current state (except for registry alerts)
    if (alertRecord.category !== "registry") {
      if (alertRecord.suppressed) {
        footerButtons += `<button class="btn btn-success me-2" onclick="unsuppressAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-fill me-1"></i> Unsuppress
        </button>`;
      } else {
        footerButtons += `<button class="btn btn-warning me-2" onclick="openSuppressModal(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-slash-fill me-1"></i> Suppress
        </button>`;
      }
    }

    // Add Delete button
    footerButtons += `<button class="btn btn-danger me-2" onclick="if(confirm('Are you sure you want to delete this alert?')) { deleteCdssAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide(); }">
      <i class="bi bi-trash-fill me-1"></i> Delete
    </button>`;

    // Add Close button
    footerButtons += `<button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;

    document.getElementById("viewAlertModalFooter").innerHTML = footerButtons;

    // Show the view modal
    const modalEl = document.getElementById("viewAlertModal");
    const viewModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    viewModal.show();
  } catch (error) {
    console.error("Error in viewCdssAlert:", error);
  }
}

/*********************************************************
  EDIT ALERT (CDSS Only)
**********************************************************/
function editCdssAlert(index) {
    // Set the alert index in the hidden field
    document.getElementById("editAlertIndex").value = index;
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    const alertRecord = patient.cdssAlertsRecords[index];

    // Set the common fields for CDSS alerts
    document.getElementById("editAlertTypeInput").value = alertRecord.type || "";
    document.getElementById("editAlertUntilInput").value = alertRecord.untilWhen || "";
    document.getElementById("editAlertReasonInput").value = alertRecord.suppressReasonType || "Medical";
    document.getElementById("editAlertReasonTextInput").value = alertRecord.suppressReason || "";

    // Hide practice-specific fields for CDSS alerts
    document.getElementById("editDueDateRow").style.display = "none";
    document.getElementById("editIndicatorRow").style.display = "none";

    // Set modal title
    document.getElementById("editAlertModalTitle").textContent = "Edit CDSS Alert";

    // Open the edit modal
    new bootstrap.Modal(document.getElementById("editAlertModal")).show();
  }

async function saveEditedAlert() {
  try {
    const index = parseInt(document.getElementById("editAlertIndex").value, 10);
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      console.error("Patient or CDSS alerts not found");
      return;
    }

    const alertRecord = patient.cdssAlertsRecords[index];
    if (!alertRecord) {
      console.error("Alert record not found at index:", index);
      return;
    }

    // Update the alert type for all alert categories
    alertRecord.type = document.getElementById("editAlertTypeInput").value.trim();

    // For registry alerts, only update the type field
    if (alertRecord.category === "registry") {
      // Do not update any suppression-related fields for registry alerts
    }
    // For CDSS and practice alerts, update suppression fields
    else {
      alertRecord.untilWhen = document.getElementById("editAlertUntilInput").value.trim();
      alertRecord.suppressReasonType = document.getElementById("editAlertReasonInput").value;
      alertRecord.suppressReason = document.getElementById("editAlertReasonTextInput").value.trim();

      // For practice alerts, update extra fields
      if (alertRecord.category === "practice") {
        const dateWhenDue = document.getElementById("editAlertDueDateInput").value;
        alertRecord.dateWhenDue = dateWhenDue;

        // Automatically calculate indicator based on due date
        if (dateWhenDue) {
          const today = new Date();
          const dueDate = new Date(dateWhenDue);
          const diffTime = dueDate - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Blue indicator for less than 90 days from today
          // Red indicator for greater than or equal to 90 days from today
          alertRecord.indicator = diffDays < 90 ? "blue" : "red";
        } else {
          // Default to red if no due date is provided
          alertRecord.indicator = "red";
        }
      }
    }

    await db.patients.put(patient);
    loadCdssAlerts();
    bootstrap.Modal.getInstance(document.getElementById("editAlertModal")).hide();
    showAlert("Alert updated successfully!", "success");
  } catch (error) {
    console.error("Error saving edited alert:", error);
    showAlert("Error updating alert: " + (error.message || "Unknown error"), "error");
  }
}

function openSuppressModal(index) {
  currentSuppressIndex = index;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;
  const alertRecord = patient.cdssAlertsRecords[index];
  if (!alertRecord) return;

  // Prevent suppression for registry alerts
  if (alertRecord.category === "registry") {
    console.error("Registry alerts cannot be suppressed");
    showAlert("Registry alerts do not support suppression", "warning");
    return;
  }

  // Set the modal title and display current suppression info.
  document.getElementById("suppressModalTitle").textContent = `Suppress Alert: ${alertRecord.type}`;
  document.getElementById("currentDueDate").innerHTML =
    alertRecord.untilWhen
      ? `<small class="text-muted">Current Suppression Days: ${alertRecord.untilWhen}</small>`
      : `<small class="text-muted">No suppression set.</small>`;

  // Clear the suppression reason input and set the default radio.
  document.getElementById("suppressReasonText").value = "";
  document.getElementById("reasonMedical").checked = true;

  // Remove any active state from all interval buttons and reset chosen interval.
  const intervalButtons = document.querySelectorAll(".suppress-interval-btn");
  intervalButtons.forEach(btn => btn.classList.remove("active"));
  chosenInterval = "";

  // Ensure the Apply button is enabled.
  document.getElementById("applySuppressionBtn").disabled = false;

  new bootstrap.Modal(document.getElementById("suppressModal")).show();
}

// For Practice Alerts – allow editing Due Date & Indicator
function editPracticeAlert(index) {
    document.getElementById("editAlertIndex").value = index;
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    const alertRecord = patient.cdssAlertsRecords[index];

    document.getElementById("editAlertTypeInput").value = alertRecord.type || "";
    document.getElementById("editAlertUntilInput").value = alertRecord.untilWhen || "";
    document.getElementById("editAlertReasonInput").value = alertRecord.suppressReasonType || "Medical";
    document.getElementById("editAlertReasonTextInput").value = alertRecord.suppressReason || "";

    // Show due date field but hide indicator field (it's auto-calculated)
    document.getElementById("editDueDateRow").style.display = "block";
    document.getElementById("editIndicatorRow").style.display = "none"; // Hide indicator field
    document.getElementById("editAlertDueDateInput").value = alertRecord.dateWhenDue || "";

    // Add a note about auto-calculated indicator
    const dueDateRow = document.getElementById("editDueDateRow");
    if (dueDateRow) {
      const noteElement = dueDateRow.querySelector(".indicator-note");
      if (!noteElement) {
        const note = document.createElement("small");
        note.className = "form-text text-muted indicator-note";
        note.textContent = "Indicator will be automatically set: Blue for less than 90 days from today, Red for 90 days or more.";
        dueDateRow.appendChild(note);
      }
    }

    // Set modal title
    document.getElementById("editAlertModalTitle").textContent = "Edit Practice Alert";

    new bootstrap.Modal(document.getElementById("editAlertModal")).show();
  }

// For Registry Alerts – allow editing only the alert type (or add extra fields if desired)
function editRegistryAlert(index) {
  document.getElementById("editAlertIndex").value = index;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const alertRecord = patient.cdssAlertsRecords[index];

  // Set the common fields for Registry alerts
  document.getElementById("editAlertTypeInput").value = alertRecord.type || "";
  document.getElementById("editAlertUntilInput").value = alertRecord.untilWhen || "";
  document.getElementById("editAlertReasonInput").value = alertRecord.suppressReasonType || "Medical";
  document.getElementById("editAlertReasonTextInput").value = alertRecord.suppressReason || "";

  // Hide extra fields for registry
  document.getElementById("editDueDateRow").style.display = "none";
  document.getElementById("editIndicatorRow").style.display = "none";

  // Set modal title
  document.getElementById("editAlertModalTitle").textContent = "Edit Registry Alert";

  new bootstrap.Modal(document.getElementById("editAlertModal")).show();
}

// Track chosen interval

function setSuppressInterval(interval) {
  chosenInterval = interval;
}

function applySuppress() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;
  const alertRecord = patient.cdssAlertsRecords[currentSuppressIndex];
  if (!chosenInterval) {
    alert("Please select an interval or 'Never Remind'.");
    return;
  }
  const radios = document.getElementsByName("suppressReasonType");
  let selectedReason = "Medical";
  for (const radio of radios) {
    if (radio.checked) {
      selectedReason = radio.value;
      break;
    }
  }
  const reasonText = document.getElementById("suppressReasonText").value.trim();
  alertRecord.untilWhen = chosenInterval;
  alertRecord.suppressed = true;
  alertRecord.suppressReasonType = selectedReason;
  alertRecord.suppressReason = reasonText;
  alertRecord.suppressTimestamp = new Date().toISOString();
  db.patients.put(patient).then(() => {
    loadCdssAlerts();
    chosenInterval = "";
    bootstrap.Modal.getInstance(document.getElementById("suppressModal")).hide();
  });
}

/*********************************************************
  DELETE ALERT
**********************************************************/
function deleteCdssAlert(index) {
  if (!confirm("Are you sure you want to delete this alert?")) return;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;
  patient.cdssAlertsRecords.splice(index, 1);
  db.patients.put(patient).then(() => {
    loadCdssAlerts();
  });
}

/*********************************************************
  UNSUPPRESS ALERT
**********************************************************/
function unsuppressAlert(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.cdssAlertsRecords) return;

  const alertRecord = patient.cdssAlertsRecords[index];
  if (!alertRecord) return;

  // Prevent unsuppression for registry alerts
  if (alertRecord.category === "registry") {
    console.error("Registry alerts cannot be unsuppressed");
    showAlert("Registry alerts do not support suppression", "warning");
    return;
  }

  // Reset suppression values
  alertRecord.untilWhen = "";
  alertRecord.suppressed = false;
  alertRecord.suppressReasonType = "";
  alertRecord.suppressReason = "";

  // Save changes to database
  db.patients.put(patient).then(() => {
    // Refresh alerts display
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();

    // Show success message
    showAlert("Alert has been unsuppressed", "success");
  }).catch(error => {
    console.error("Error unsuppressing alert:", error);
    showAlert("Error unsuppressing alert", "error");
  });
}


/*********************************************************
  UPDATE PRACTICE ALERT INDICATORS
**********************************************************/
// Function to fix all practice alert indicators for a single patient
function updatePracticeAlertIndicators(patient) {
  if (!patient || !patient.cdssAlertsRecords) return;

  let needsUpdate = false;

  // Loop through all alerts and update practice alert indicators
  patient.cdssAlertsRecords.forEach(alert => {
    if (alert.category === "practice" && alert.dateWhenDue) {
      const today = new Date();
      const dueDate = new Date(alert.dateWhenDue);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Calculate the correct indicator
      const correctIndicator = diffDays < 90 ? "blue" : "red";

      // If the indicator is missing or incorrect, update it
      if (alert.indicator !== correctIndicator) {
        alert.indicator = correctIndicator;
        needsUpdate = true;
        console.log("Updated indicator for alert:", alert.type, "to:", correctIndicator);
      }
    }
  });

  // If any indicators were updated, save the changes
  if (needsUpdate) {
    return db.patients.put(patient).then(() => {
      console.log("Updated practice alert indicators for patient:", patient.name);
      return true;
    }).catch(error => {
      console.error("Error updating practice alert indicators:", error);
      return false;
    });
  }

  return Promise.resolve(false); // No updates needed
}

// Function to fix all practice alert indicators for all patients
async function fixAllPracticeAlertIndicators() {
  try {
    const patients = await db.patients.toArray();
    let updatedCount = 0;

    for (const patient of patients) {
      if (patient.cdssAlertsRecords && patient.cdssAlertsRecords.length > 0) {
        const hasUpdates = await updatePracticeAlertIndicators(patient);
        if (hasUpdates) updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`Fixed practice alert indicators for ${updatedCount} patients`);
      // Reload the patients cache after updates
      await loadPatientsFromDB();
    }
  } catch (error) {
    console.error("Error fixing practice alert indicators:", error);
  }
}

/*********************************************************
  LOAD CDSS ALERTS (CDSS sub-tab only – without indicator/due date)
**********************************************************/
function loadCdssAlerts() {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;

  // Update practice alert indicators based on due dates
  updatePracticeAlertIndicators(patient);

  // Clear table bodies for each sub-tab
  document.getElementById("cdssAlertTableBody").innerHTML = "";
  document.getElementById("practiceAlertTableBody").innerHTML = "";
  document.getElementById("registryAlertTableBody").innerHTML = "";

  let cdssCount = 0, practiceCount = 0, registryCount = 0;

  if (patient.cdssAlertsRecords && patient.cdssAlertsRecords.length > 0) {
    patient.cdssAlertsRecords.forEach((alertRecord, index) => {
      const tr = document.createElement("tr");

      if (alertRecord.category === "cdss") {
        cdssCount++;
        // For CDSS alerts, display only the alert type
        const tdType = document.createElement("td");
        tdType.textContent = alertRecord.type;
        tr.appendChild(tdType);
        // Actions: View, Edit, Suppress/Unsuppress, Delete
        const tdActions = document.createElement("td");

        // Always show View and Edit buttons
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editCdssAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Show either Suppress or Unsuppress button based on current state
        if (alertRecord.suppressed) {
          buttonsHtml += `
<button class="btn btn-success btn-sm me-1" style="background-color: #28a745; border: none; color: white;" onclick="unsuppressAlert(${index})">
  <i class="bi bi-bell-fill me-1"></i> Unsuppress
</button>`;
        } else {
          buttonsHtml += `
<button class="btn btn-warning btn-sm me-1" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">
  <i class="bi bi-bell-slash-fill me-1"></i> Suppress
</button>`;
        }

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        tdActions.innerHTML = buttonsHtml;
        tr.appendChild(tdActions);
        document.getElementById("cdssAlertTableBody").appendChild(tr);
      }
      else if (alertRecord.category === "practice") {
        practiceCount++;
        // For Practice alerts: display type, due date and indicator
        let td = document.createElement("td");
        td.textContent = alertRecord.type;
        tr.appendChild(td);

        td = document.createElement("td");
        td.textContent = alertRecord.dateWhenDue || "";
        tr.appendChild(td);

        td = document.createElement("td");
        // Create a colored indicator box based on the indicator value
        console.log("Indicator value:", alertRecord.indicator);
        const indicatorColor = alertRecord.indicator === "blue" ? "#007bff" :
                              alertRecord.indicator === "red" ? "#dc3545" :
                              "#cccccc"; // Default to light gray if not set
        td.innerHTML = `<div style="width:20px; height:20px; background-color:${indicatorColor}; border-radius:3px;"></div>`;
        tr.appendChild(td);

        td = document.createElement("td");

        // Always show View and Edit buttons
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editPracticeAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Show either Suppress or Unsuppress button based on current state
        if (alertRecord.suppressed) {
          buttonsHtml += `
<button class="btn btn-success btn-sm me-1" style="background-color: #28a745; border: none; color: white;" onclick="unsuppressAlert(${index})">
  <i class="bi bi-bell-fill me-1"></i> Unsuppress
</button>`;
        } else {
          buttonsHtml += `
<button class="btn btn-warning btn-sm me-1" style="background-color: #f0ad4e; border: none; color: white;" onclick="openSuppressModal(${index})">
  <i class="bi bi-bell-slash-fill me-1"></i> Suppress
</button>`;
        }

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        td.innerHTML = buttonsHtml;
        tr.appendChild(td);
        document.getElementById("practiceAlertTableBody").appendChild(tr);
      }
      else if (alertRecord.category === "registry") {
        registryCount++;
        // For Registry alerts: display only type
        let td = document.createElement("td");
        td.textContent = alertRecord.type;
        tr.appendChild(td);

        td = document.createElement("td");

        // Always show View and Edit buttons
        let buttonsHtml = `
<button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewCdssAlert(${index})">
  <i class="bi bi-eye-fill me-1"></i> View
</button>
<button class="btn btn-primary btn-sm me-1" style="background-color: #007bff; border: none; color: white;" onclick="editRegistryAlert(${index})">
  <i class="bi bi-pencil-fill me-1"></i> Edit
</button>`;

        // Registry alerts don't support suppression, so don't show suppress/unsuppress buttons

        // Always show Delete button
        buttonsHtml += `
<button class="btn btn-danger btn-sm" style="background-color: #d9534f; border: none; color: white;" onclick="deleteCdssAlert(${index})">
  <i class="bi bi-trash-fill me-1"></i> Delete
</button>`;

        td.innerHTML = buttonsHtml;
        tr.appendChild(td);
        document.getElementById("registryAlertTableBody").appendChild(tr);
      }
    });
  }

  document.getElementById("emptyCdssAlert").style.display = cdssCount === 0 ? "block" : "none";
  document.getElementById("emptyPracticeAlert").style.display = practiceCount === 0 ? "block" : "none";
  document.getElementById("emptyRegistryAlert").style.display = registryCount === 0 ? "block" : "none";
}

/*********************************************************
  ADD ALERT FUNCTIONS (CDSS Only – no indicator input)
**********************************************************/
function openCdssAlertForm(category) {
  document.getElementById("alertCategory").value = category;
  // For practice alerts, show due date container; for CDSS, hide it.
  document.getElementById("dateWhenDueContainer").style.display = category === "practice" ? "block" : "none";
  document.getElementById("alertTypeInput").value = "";
  // Removed indicator input – no need to select an indicator.
  document.getElementById("alertDueDateInput").value = "";
  new bootstrap.Modal(document.getElementById("cdssAlertFormModal")).show();
}

function saveCdssAlertForm() {
  const alertType = document.getElementById("alertTypeInput").value.trim();
  if (!alertType) {
    alert("Please enter an alert type.");
    return;
  }

  const category = document.getElementById("alertCategory").value;
  let dateWhenDue = "";
  let indicator = "";

  if (category === "practice") {
    dateWhenDue = document.getElementById("alertDueDateInput").value;

    // If due date is provided, calculate indicator color based on days from today
    if (dateWhenDue) {
      const today = new Date();
      const dueDate = new Date(dateWhenDue);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Blue indicator for less than 90 days from today
      // Red indicator for greater than or equal to 90 days from today
      indicator = diffDays < 90 ? "blue" : "red";
      console.log("Setting indicator to:", indicator, "for diffDays:", diffDays);
    } else {
      // Default to red if no due date is provided
      indicator = "red";
      console.log("No due date, defaulting indicator to red");
    }
  }

  const newAlert = {
    type: alertType,
    category: category,
    dateWhenDue: dateWhenDue,
    dueDate: "",
    untilWhen: "",
    suppressed: false,
    indicator: indicator // Add the indicator based on due date
  };

  console.log("Creating new alert with indicator:", newAlert.indicator);

  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient) return;
  if (!patient.cdssAlertsRecords) patient.cdssAlertsRecords = [];
  patient.cdssAlertsRecords.push(newAlert);

  db.patients.put(patient).then(() => {
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();
    bootstrap.Modal.getInstance(document.getElementById("cdssAlertFormModal")).hide();
    showAlert("Alert added successfully!", "success");
  });
}

/*********************************************************
  VIEW ALERT FUNCTIONS (CDSS Only – no indicator/due date display)
**********************************************************/
function viewCdssAlert(index) {
  try {
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      console.error("No patient or alerts found.");
      return;
    }
    if (index < 0 || index >= patient.cdssAlertsRecords.length) {
      console.error("Invalid alert index.");
      return;
    }
    const alertRecord = patient.cdssAlertsRecords[index];
    if (!alertRecord) {
      console.error("Alert record not found.");
      return;
    }

    // Get all the elements we need to work with
    const patientInfoEl = document.getElementById("viewAlertPatientInfo");
    const typeEl = document.getElementById("viewAlertType");
    const allergiesContainerEl = document.getElementById("viewAlertAllergiesContainer");
    const allergiesEl = document.getElementById("viewAlertAllergies");
    const dueDateContainerEl = document.getElementById("viewAlertDueDateContainer");
    const dueDateEl = document.getElementById("viewAlertDueDate");
    const indicatorContainerEl = document.getElementById("viewAlertIndicatorContainer");
    const indicatorEl = document.getElementById("viewAlertIndicator");
    const suppressionContainerEl = document.getElementById("viewAlertSuppressionStatusContainer");
    const untilEl = document.getElementById("viewAlertUntil");

    // Set patient info
    if (patientInfoEl) patientInfoEl.textContent = `${patient.id || patient.patientId} - ${patient.name}`;

    // Hide all specific field containers by default
    if (allergiesContainerEl) allergiesContainerEl.style.display = "none";
    if (dueDateContainerEl) dueDateContainerEl.style.display = "none";
    if (indicatorContainerEl) indicatorContainerEl.style.display = "none";
    if (suppressionContainerEl) suppressionContainerEl.style.display = "none";

    // Common field for all alert types: Alert Type
    if (typeEl) typeEl.textContent = alertRecord.type || "";

    // SPECIFIC FIELDS FOR EACH ALERT TYPE

    // 1. For Medication Alert: show ONLY Allergies field prominently
    if (alertRecord.type && alertRecord.type.includes("Medication")) {
      // Get allergies from nursing history if available
      let allergiesText = "—";
      if (patient.nursingHistoryRecords && patient.nursingHistoryRecords.length > 0) {
        const allergies = patient.nursingHistoryRecords
          .map(record => record.allergies)
          .filter(allergies => allergies)
          .join(", ");

        if (allergies) {
          allergiesText = allergies;
        }
      }
      if (allergiesEl) allergiesEl.textContent = allergiesText;
      if (allergiesContainerEl) allergiesContainerEl.style.display = "block";
    }
    // 2. For CDSS Alert: show ONLY Alert Type and Suppression status
    else if (alertRecord.category === "cdss") {
      // Show Alert Type (already shown above)

      // Always show Suppression status for CDSS alerts
      if (untilEl) untilEl.textContent = alertRecord.suppressed ? alertRecord.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 3. For Practice Created Alert: show ONLY Alert Type, Due Date, Indicator, and Suppression status
    else if (alertRecord.category === "practice") {
      // Show Alert Type (already shown above)

      // Show Due Date
      if (dueDateEl) dueDateEl.textContent = alertRecord.dateWhenDue || "";
      if (dueDateContainerEl) dueDateContainerEl.style.display = "block";

      // Show Indicator with appropriate color
      const indicatorColor = alertRecord.indicator === "blue" ? "#007bff" :
                            alertRecord.indicator === "red" ? "#dc3545" :
                            "#cccccc"; // Default to light gray if not set

      if (indicatorEl) indicatorEl.innerHTML =
        `<div style="width:20px; height:20px; background-color:${indicatorColor}; border-radius:3px; display:inline-block; vertical-align:middle;"></div>`;
      if (indicatorContainerEl) indicatorContainerEl.style.display = "block";

      // Always show Suppression status for Practice alerts
      if (untilEl) untilEl.textContent = alertRecord.suppressed ? alertRecord.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 4. For Registry Alert: show ONLY Alert Type
    else if (alertRecord.category === "registry") {
      // Show Alert Type (already shown above)
      // No other fields should be shown
    }

    // Prepare footer buttons based on alert type
    let footerButtons = '';

    // Add Edit button for all alert types
    if (alertRecord.category === "cdss") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editCdssAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (alertRecord.category === "practice") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editPracticeAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (alertRecord.category === "registry") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editRegistryAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    }

    // Add Suppress/Unsuppress button based on current state and alert category
    // Only show for CDSS and Practice alerts, not for Registry alerts
    if (alertRecord.category !== "registry") {
      if (alertRecord.suppressed) {
        footerButtons += `<button class="btn btn-success me-2" onclick="unsuppressAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-fill me-1"></i> Unsuppress
        </button>`;
      } else {
        footerButtons += `<button class="btn btn-warning me-2" onclick="openSuppressModal(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-slash-fill me-1"></i> Suppress
        </button>`;
      }
    }

    // Add Delete button
    footerButtons += `<button class="btn btn-danger me-2" onclick="if(confirm('Are you sure you want to delete this alert?')) { deleteCdssAlert(${index}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide(); }">
      <i class="bi bi-trash-fill me-1"></i> Delete
    </button>`;

    // Add Close button
    footerButtons += `<button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;

    document.getElementById("viewAlertModalFooter").innerHTML = footerButtons;

    // Show the view modal
    const modalEl = document.getElementById("viewAlertModal");
    const viewModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    viewModal.show();
  } catch (error) {
    console.error("Error in viewCdssAlert:", error);
  }
}
/*********************************************************
  EDIT ALERT FUNCTIONS (CDSS Only – only edit type)
**********************************************************/
function editCdssAlert(index) {
  document.getElementById("editAlertIndex").value = index;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const alertRecord = patient.cdssAlertsRecords[index];

  // Populate common fields for CDSS alerts
  document.getElementById("editAlertTypeInput").value = alertRecord.type || "";
  document.getElementById("editAlertUntilInput").value = alertRecord.untilWhen || "";
  document.getElementById("editAlertReasonInput").value = alertRecord.suppressReasonType || "Medical";
  document.getElementById("editAlertReasonTextInput").value = alertRecord.suppressReason || "";

  // Hide practice-specific fields
  document.getElementById("editDueDateRow").style.display = "none";
  document.getElementById("editIndicatorRow").style.display = "none";

  // Set modal title
  document.getElementById("editAlertModalTitle").textContent = "Edit CDSS Alert";

  new bootstrap.Modal(document.getElementById("editAlertModal")).show();
}

function editPracticeAlert(index) {
  document.getElementById("editAlertIndex").value = index;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const alertRecord = patient.cdssAlertsRecords[index];

  // Populate common fields
  document.getElementById("editAlertTypeInput").value = alertRecord.type || "";
  document.getElementById("editAlertUntilInput").value = alertRecord.untilWhen || "";
  document.getElementById("editAlertReasonInput").value = alertRecord.suppressReasonType || "Medical";
  document.getElementById("editAlertReasonTextInput").value = alertRecord.suppressReason || "";

  // Show and populate practice-specific fields
  document.getElementById("editDueDateRow").style.display = "";
  document.getElementById("editIndicatorRow").style.display = "";
  document.getElementById("editAlertDueDateInput").value = alertRecord.dateWhenDue || "";

  // Set indicator color if available
  if (alertRecord.indicator) {
    document.getElementById("editAlertIndicatorInput").value = alertRecord.indicator;
  } else {
    document.getElementById("editAlertIndicatorInput").value = "#cccccc"; // Default gray
  }

  // Set modal title
  document.getElementById("editAlertModalTitle").textContent = "Edit Practice Alert";

  new bootstrap.Modal(document.getElementById("editAlertModal")).show();
}

function editRegistryAlert(index) {
  document.getElementById("editAlertIndex").value = index;
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const alertRecord = patient.cdssAlertsRecords[index];

  // Populate only the alert type field for registry alerts
  document.getElementById("editAlertTypeInput").value = alertRecord.type || "";

  // Hide suppression fields for registry alerts
  document.getElementById("editAlertUntilInput").value = "";
  document.getElementById("editAlertReasonInput").value = "Medical";
  document.getElementById("editAlertReasonTextInput").value = "";

  // Get the suppression-related elements
  const untilInputContainer = document.getElementById("editAlertUntilInput").parentElement;
  const reasonInputContainer = document.getElementById("editAlertReasonInput").parentElement;
  const reasonTextInputContainer = document.getElementById("editAlertReasonTextInput").parentElement;

  // Hide suppression-related fields
  if (untilInputContainer) untilInputContainer.style.display = "none";
  if (reasonInputContainer) reasonInputContainer.style.display = "none";
  if (reasonTextInputContainer) reasonTextInputContainer.style.display = "none";

  // Hide practice-specific fields
  document.getElementById("editDueDateRow").style.display = "none";
  document.getElementById("editIndicatorRow").style.display = "none";

  // Set modal title
  document.getElementById("editAlertModalTitle").textContent = "Edit Registry Alert";

  new bootstrap.Modal(document.getElementById("editAlertModal")).show();
}
/*********************************************************
  SUPPRESSION MODAL FUNCTIONS (Preset intervals & reason)
**********************************************************/
let currentSuppressIndex = null;
let chosenInterval = "";

function openSuppressModal(index) {
  try {
    console.log("Opening suppress modal for alert index:", index);
    currentSuppressIndex = index;
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      console.error("Patient or CDSS alerts not found");
      return;
    }

    const alertRecord = patient.cdssAlertsRecords[index];
    if (!alertRecord) {
      console.error("Alert record not found at index:", index);
      return;
    }

    // Prevent suppression for registry alerts
    if (alertRecord.category === "registry") {
      console.error("Registry alerts cannot be suppressed");
      showAlert("Registry alerts do not support suppression in the EHR system", "warning");
      return;
    }

    // Set the modal title with alert type
    const modalTitleEl = document.getElementById("suppressModalTitle");
    if (modalTitleEl) {
      modalTitleEl.textContent = `Suppress Alert: ${alertRecord.type}`;
    } else {
      console.error("suppressModalTitle element not found");
    }

    // Create detailed info message
    let infoMessage = `<strong>Alert Type:</strong> ${alertRecord.type}`;

    // Add category-specific information
    if (alertRecord.category === "practice" && alertRecord.dateWhenDue) {
      infoMessage += `<br><strong>Due Date:</strong> ${alertRecord.dateWhenDue}`;
    }

    // Add current suppression status
    if (alertRecord.suppressed) {
      infoMessage += `<br><strong>Current Status:</strong> <span class="badge bg-secondary">Suppressed</span>`;
      infoMessage += `<br><strong>Suppression Period:</strong> ${alertRecord.untilWhen || "Not specified"}`;
      if (alertRecord.suppressReasonType) {
        infoMessage += `<br><strong>Reason:</strong> ${alertRecord.suppressReasonType}`;
      }
    } else {
      infoMessage += `<br><strong>Current Status:</strong> <span class="badge bg-success">Active</span>`;
    }

    const infoEl = document.getElementById("currentSuppressInfo");
    if (infoEl) {
      infoEl.innerHTML = infoMessage;
    } else {
      console.error("currentSuppressInfo element not found");
    }

    // Reset form fields
    const reasonTextEl = document.getElementById("suppressReasonText");
    if (reasonTextEl) {
      reasonTextEl.value = alertRecord.suppressReason || "";
    }

    // Set the appropriate reason radio button
    if (alertRecord.suppressReasonType) {
      const reasonId = `reason${alertRecord.suppressReasonType}`;
      const reasonRadio = document.getElementById(reasonId);
      if (reasonRadio) {
        reasonRadio.checked = true;
      } else {
        const medicalRadio = document.getElementById("reasonMedical");
        if (medicalRadio) medicalRadio.checked = true;
      }
    } else {
      const medicalRadio = document.getElementById("reasonMedical");
      if (medicalRadio) medicalRadio.checked = true;
    }

    // Remove active state from all interval buttons
    const intervalButtons = document.querySelectorAll(".suppress-interval-btn");
    intervalButtons.forEach(btn => btn.classList.remove("active"));

    // If already suppressed, highlight the current interval
    if (alertRecord.suppressed && alertRecord.untilWhen) {
      const currentIntervalBtn = document.querySelector(`.suppress-interval-btn[data-interval="${alertRecord.untilWhen}"]`);
      if (currentIntervalBtn) {
        currentIntervalBtn.classList.add("active");
        chosenInterval = alertRecord.untilWhen;
      } else {
        chosenInterval = "";
      }
    } else {
      chosenInterval = "";
    }

    // Show the modal
    const modalEl = document.getElementById("suppressModal");
    if (modalEl) {
      const suppressModal = new bootstrap.Modal(modalEl);
      suppressModal.show();
    } else {
      console.error("suppressModal element not found");
    }
  } catch (error) {
    console.error("Error in openSuppressModal:", error);
  }
}

function setSuppressInterval(interval, btn) {
  // Toggle selection: if same interval is already chosen, cancel it
  if (chosenInterval === interval) {
    btn.classList.remove("active");
    chosenInterval = "";
  } else {
    // Remove active class from all buttons
    const modalEl = document.getElementById("suppressModal");
    const intervalButtons = modalEl.querySelectorAll(".suppress-interval-btn");
    intervalButtons.forEach(button => button.classList.remove("active"));

    // Set new chosen interval and mark clicked button as active
    chosenInterval = interval;
    btn.classList.add("active");
  }
}

async function applySuppress() {
  try {
    console.log("Applying suppression for alert index:", currentSuppressIndex);
    const patient = getPatients().find(p => p.id === currentPatientIndex);
    if (!patient || !patient.cdssAlertsRecords) {
      console.error("Patient or CDSS alerts not found");
      return;
    }

    const alertRecord = patient.cdssAlertsRecords[currentSuppressIndex];
    if (!alertRecord) {
      console.error("Alert record not found at index:", currentSuppressIndex);
      return;
    }

    // Prevent suppression for registry alerts
    if (alertRecord.category === "registry") {
      console.error("Registry alerts cannot be suppressed");
      showAlert("Registry alerts do not support suppression in the EHR system", "warning");
      return;
    }

    // If no interval chosen, show error message
    if (!chosenInterval) {
      showAlert("Please select a suppression interval", "warning");
      return;
    }

    // Get selected reason from radio buttons
    const radios = document.getElementsByName("suppressReasonType");
    let selectedReason = "Medical";
    for (const radio of radios) {
      if (radio.checked) {
        selectedReason = radio.value;
        break;
      }
    }

    // Get reason details
    const reasonTextEl = document.getElementById("suppressReasonText");
    const reasonText = reasonTextEl ? reasonTextEl.value.trim() : "";

    // Store the interval for the success message before it gets reset
    const intervalForMessage = chosenInterval;

    // Update alert record
    alertRecord.untilWhen = chosenInterval;
    alertRecord.suppressed = true;
    alertRecord.suppressReasonType = selectedReason;
    alertRecord.suppressReason = reasonText;
    alertRecord.suppressTimestamp = new Date().toISOString();

    // Set indicator color based on interval
    if (chosenInterval === "Never") {
      alertRecord.indicator = "red";
    } else if (chosenInterval.endsWith("M") || chosenInterval.endsWith("Y")) {
      alertRecord.indicator = "red";
    } else {
      alertRecord.indicator = "blue";
    }

    // Save changes to database
    await db.patients.put(patient);

    // Refresh alerts display
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();

    // Reset chosen interval
    chosenInterval = "";

    // Close modal
    const modalEl = document.getElementById("suppressModal");
    if (modalEl) {
      const suppressModal = bootstrap.Modal.getInstance(modalEl);
      if (suppressModal) {
        suppressModal.hide();
      } else {
        console.error("Could not get Modal instance for suppressModal");
      }
    } else {
      console.error("suppressModal element not found");
    }

    // Show success message
    if (intervalForMessage === "Never") {
      showAlert("Alert permanently suppressed", "success");
    } else {
      showAlert(`Alert suppressed for ${intervalForMessage}`, "success");
    }
  } catch (error) {
    console.error("Error applying suppression:", error);
    showAlert("Error applying suppression: " + (error.message || "Unknown error"), "error");
  }
}
/*********************************************************
  PATIENT ALERT NOTIFICATION FUNCTIONS
**********************************************************/

// Function to show the patient alert notification with a message
function showPatientAlert(message) {
  const alertDiv = document.getElementById("patientAlertNotification");
  const alertMessage = document.getElementById("patientAlertMessage");
  alertMessage.textContent = message;

  // Set display to block and fade in by setting opacity to 1
  alertDiv.style.display = "block";
  // Give a short delay to ensure the display change is applied before fading in
  setTimeout(() => {
    alertDiv.style.opacity = "1";
  }, 10);
}

// Function to hide the patient alert notification
function closePatientAlert() {
  const alertDiv = document.getElementById("patientAlertNotification");
  // Fade out by setting opacity to 0
  alertDiv.style.opacity = "0";
  // After the transition period (500ms), set display to none
  setTimeout(() => {
    alertDiv.style.display = "none";
  }, 500);
}


// Returns an array of all active (unsuppressed) alerts from all patients.
function getAllActiveAlerts() {
  let activeAlerts = [];

  patientsCache.forEach(patient => {
    // 🔸 CDSS (general) alerts
    if (patient.cdssAlertsRecords && patient.cdssAlertsRecords.length > 0) {
      patient.cdssAlertsRecords.forEach((alert, idx) => {
        if (!alert.suppressed && !dismissedAlerts.some(d => d.patientDbId === patient.id && d.alertIndex === idx)) {
          activeAlerts.push({
            source: "cdss",
            patientId: patient.patientId,
            patientName: patient.name,
            patientDbId: patient.id,
            alertIndex: idx,
            alert: alert
          });
        }
      });
    }

    // 🔸 Medication Dosing Alerts (from MAR/allergy match)
    if (patient.dosingAlertsRecords && patient.dosingAlertsRecords.length > 0) {
      patient.dosingAlertsRecords.forEach((alert, idx) => {
        activeAlerts.push({
          source: "dosing",
          patientId: patient.patientId,
          patientName: patient.name,
          patientDbId: patient.id,
          alertIndex: idx,
          alert: alert
        });
      });
    }
  });

  return activeAlerts;
}

function viewDosingAlert(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  if (!patient || !patient.dosingAlertsRecords || !patient.dosingAlertsRecords[index]) return;

  const alert = patient.dosingAlertsRecords[index];

  // Display basic alert information
  document.getElementById("viewDosingAlertType").textContent = alert.type || "—";
  document.getElementById("viewDosingAlertDescription").textContent = alert.description || "—";
  document.getElementById("viewDosingAlertCreatedAt").textContent = alert.createdAt
    ? new Date(alert.createdAt).toLocaleString()
    : "—";

  // Get allergies from nursing history if available
  let allergiesText = "—";
  if (patient.nursingHistoryRecords && patient.nursingHistoryRecords.length > 0) {
    const allergies = patient.nursingHistoryRecords
      .map(record => record.allergies)
      .filter(allergies => allergies)
      .join(", ");

    if (allergies) {
      allergiesText = allergies;
    }
  }
  document.getElementById("viewDosingAlertAllergies").textContent = allergiesText;

  // Display suppression status
  document.getElementById("viewDosingAlertSuppressed").textContent =
    alert.suppressed ? "Yes (Until: " + (alert.untilWhen || "Not specified") + ")" : "No";

  new bootstrap.Modal(document.getElementById("viewDosingAlertModal")).show();
}

// Update the notification badge based on active alerts count
function updateAlertsBadge() {
  const activeAlerts = getAllActiveAlerts();
  const badge = document.getElementById("alertsBadge");
  if (activeAlerts.length > 0) {
    badge.style.display = "flex";
    badge.textContent = activeAlerts.length;
  } else {
    badge.style.display = "none";
  }
}
// Load notifications list in the offcanvas
function loadNotifications() {
  let activeAlerts = getAllActiveAlerts();

  // Clear all containers
  const allAlertsContainer = document.getElementById("alertsOffcanvasContent");
  const cdssAlertsContainer = document.getElementById("cdssAlertsContent");
  const practiceAlertsContainer = document.getElementById("practiceAlertsContent");
  const registryAlertsContainer = document.getElementById("registryAlertsContent");

  allAlertsContainer.innerHTML = "";
  cdssAlertsContainer.innerHTML = "";
  practiceAlertsContainer.innerHTML = "";
  registryAlertsContainer.innerHTML = "";

  // Filter alerts by category
  const cdssAlerts = activeAlerts.filter(item => item.alert.category === "cdss" || item.source === "dosing");
  const practiceAlerts = activeAlerts.filter(item => item.alert.category === "practice");
  const registryAlerts = activeAlerts.filter(item => item.alert.category === "registry");

  // Update tab badges with counts
  document.getElementById("cdss-alerts-tab").innerHTML = `CDSS <span class="badge bg-primary rounded-pill ms-1">${cdssAlerts.length}</span>`;
  document.getElementById("practice-alerts-tab").innerHTML = `Practice <span class="badge bg-primary rounded-pill ms-1">${practiceAlerts.length}</span>`;
  document.getElementById("registry-alerts-tab").innerHTML = `Registry <span class="badge bg-primary rounded-pill ms-1">${registryAlerts.length}</span>`;

  if (activeAlerts.length === 0) {
    // Show empty state for all tabs
    showEmptyState(allAlertsContainer, "No active alerts");
    showEmptyState(cdssAlertsContainer, "No CDSS alerts");
    showEmptyState(practiceAlertsContainer, "No practice alerts");
    showEmptyState(registryAlertsContainer, "No registry alerts");
  } else {
    // Group alerts by patient
    const patientGroups = groupAlertsByPatient(activeAlerts);

    // Populate the All Alerts tab with patient groups
    populatePatientGroups(allAlertsContainer, patientGroups);

    // Group CDSS alerts by patient
    const cdssPatientGroups = groupAlertsByPatient(cdssAlerts);
    populatePatientGroups(cdssAlertsContainer, cdssPatientGroups);

    // Group Practice alerts by patient
    const practicePatientGroups = groupAlertsByPatient(practiceAlerts);
    populatePatientGroups(practiceAlertsContainer, practicePatientGroups);

    // Group Registry alerts by patient
    const registryPatientGroups = groupAlertsByPatient(registryAlerts);
    populatePatientGroups(registryAlertsContainer, registryPatientGroups);
  }

  updateAlertsBadge();
}

// Helper function to show empty state
function showEmptyState(container, message) {
  container.innerHTML = `
    <div class="alert-empty-state">
      <i class="bi bi-bell-slash"></i>
      <p>${message}</p>
    </div>
  `;
}

// Helper function to group alerts by patient
function groupAlertsByPatient(alerts) {
  const patientGroups = {};

  alerts.forEach(item => {
    const patientKey = item.patientDbId;
    if (!patientGroups[patientKey]) {
      patientGroups[patientKey] = {
        patientId: item.patientId,
        patientName: item.patientName,
        alerts: []
      };
    }
    patientGroups[patientKey].alerts.push(item);
  });

  return patientGroups;
}

// Helper function to populate patient groups
function populatePatientGroups(container, patientGroups) {
  if (Object.keys(patientGroups).length === 0) {
    showEmptyState(container, "No alerts");
    return;
  }

  // Sort patients by name
  const sortedPatientKeys = Object.keys(patientGroups).sort((a, b) => {
    return patientGroups[a].patientName.localeCompare(patientGroups[b].patientName);
  });

  sortedPatientKeys.forEach(patientKey => {
    const patientGroup = patientGroups[patientKey];
    const patientAlertsGroup = document.createElement("div");
    patientAlertsGroup.className = "patient-alerts-group";

    // Create patient header
    const patientHeader = document.createElement("div");
    patientHeader.className = "patient-alerts-header";
    patientHeader.innerHTML = `
      <h6><i class="bi bi-person-fill"></i> ${patientGroup.patientId} - ${patientGroup.patientName}</h6>
      <span class="badge bg-primary rounded-pill">${patientGroup.alerts.length} alerts</span>
    `;
    patientAlertsGroup.appendChild(patientHeader);

    // Create alerts container
    const alertsBody = document.createElement("div");
    alertsBody.className = "patient-alerts-body";

    // Add each alert
    patientGroup.alerts.forEach(item => {
      const alertElement = createAlertElement(item);
      alertsBody.appendChild(alertElement);
    });

    patientAlertsGroup.appendChild(alertsBody);
    container.appendChild(patientAlertsGroup);
  });
}

// Helper function to create an alert element
function createAlertElement(item) {
  // Determine category and styling
  let categoryLabel = "";
  let categoryClass = "";

  if (item.source === "dosing") {
    categoryLabel = "Dosing";
    categoryClass = "cdss";
  } else if (item.alert.category === "cdss") {
    categoryLabel = "CDSS";
    categoryClass = "cdss";
  } else if (item.alert.category === "practice") {
    categoryLabel = "Practice";
    categoryClass = "practice";
  } else if (item.alert.category === "registry") {
    categoryLabel = "Registry";
    categoryClass = "registry";
  }

  // Create alert item element
  const alertItem = document.createElement("div");
  alertItem.className = `alert-item ${categoryClass}`;

  // Alert title with badge
  const titleDiv = document.createElement("div");
  titleDiv.className = "alert-title";
  titleDiv.innerHTML = `
    <span>${truncateText(item.alert.type || "Alert", 30)}</span>
    <span class="badge ${categoryClass}">${categoryLabel}</span>
  `;
  alertItem.appendChild(titleDiv);

  // Status info
  const statusDiv = document.createElement("div");
  if (item.alert.suppressed) {
    statusDiv.className = "alert-status suppressed";
    statusDiv.innerHTML = `<i class="bi bi-bell-slash-fill"></i> Suppressed`;
    if (item.alert.untilWhen) {
      statusDiv.innerHTML += ` until: ${item.alert.untilWhen}`;
    }
  } else {
    statusDiv.className = "alert-status active";
    statusDiv.innerHTML = `<i class="bi bi-bell-fill"></i> Active`;
  }
  alertItem.appendChild(statusDiv);

  // Action buttons
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "alert-actions";

  // View button
  const viewBtn = document.createElement("button");
  viewBtn.className = "btn-view";
  viewBtn.innerHTML = `<i class="bi bi-eye-fill"></i> View`;
  viewBtn.onclick = (e) => {
    e.stopPropagation();
    viewNotificationAlert(item);
  };
  actionsDiv.appendChild(viewBtn);

  // Suppress/Unsuppress button - only for non-registry alerts
  if (item.alert.category !== "registry") {
    if (item.alert.suppressed) {
      const unsuppressBtn = document.createElement("button");
      unsuppressBtn.className = "btn-unsuppress";
      unsuppressBtn.innerHTML = `<i class="bi bi-bell-fill"></i> Unsuppress`;
      unsuppressBtn.onclick = (e) => {
        e.stopPropagation();
        unsuppressAlertFromNotification(item);
      };
      actionsDiv.appendChild(unsuppressBtn);
    } else {
      const suppressBtn = document.createElement("button");
      suppressBtn.className = "btn-suppress";
      suppressBtn.innerHTML = `<i class="bi bi-bell-slash-fill"></i> Suppress`;
      suppressBtn.onclick = (e) => {
        e.stopPropagation();
        openSuppressModalFromNotification(item);
      };
      actionsDiv.appendChild(suppressBtn);
    }
  }

  alertItem.appendChild(actionsDiv);

  // Make the whole item clickable to view details
  alertItem.style.cursor = "pointer";
  alertItem.onclick = () => viewNotificationAlert(item);

  return alertItem;
}
// Attach the notifications loader to the notification icon.
document.getElementById("notificationIcon").addEventListener("click", loadNotifications);

// Function to change the alerts page
function changeAlertsPage(newPage) {
  alertsPage = newPage;
  loadNotifications();
}

// Function to dismiss an alert from the notification panel
function dismissAlert(item) {
  if (!dismissedAlerts.some(d => d.patientDbId === item.patientDbId && d.alertIndex === item.alertIndex)) {
    dismissedAlerts.push({
      patientDbId: item.patientDbId,
      alertIndex: item.alertIndex
    });
  }

  loadNotifications();
  showAlert("Alert dismissed", "success");
}

// Function to unsuppress an alert from the notification panel
function unsuppressAlertFromNotification(item) {
  const patient = getPatients().find(p => p.id === item.patientDbId);
  if (!patient || !patient.cdssAlertsRecords) return;

  const alertRecord = patient.cdssAlertsRecords[item.alertIndex];
  if (!alertRecord) return;

  // Reset suppression values
  alertRecord.untilWhen = "";
  alertRecord.suppressed = false;
  alertRecord.suppressReasonType = "";
  alertRecord.suppressReason = "";

  // Save changes to database
  db.patients.put(patient).then(() => {
    // Refresh alerts display
    loadCdssAlerts();
    updateAlertsBadge();
    loadNotifications();

    // Show success message
    showAlert("Alert has been unsuppressed", "success");
  }).catch(error => {
    console.error("Error unsuppressing alert:", error);
    showAlert("Error unsuppressing alert", "error");
  });
}

// Function to open suppress modal from notification panel
function openSuppressModalFromNotification(item) {
  // Check if this is a registry alert
  if (item.alert.category === "registry") {
    console.error("Registry alerts cannot be suppressed");
    showAlert("Registry alerts do not support suppression", "warning");
    return;
  }

  // Set the current patient index to the alert's patient
  currentPatientIndex = item.patientDbId;

  // Call the regular suppress modal function with the alert index
  openSuppressModal(item.alertIndex);

  // Close the offcanvas
  const offcanvasEl = document.getElementById("alertsOffcanvas");
  const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
  if (offcanvas) {
    offcanvas.hide();
  }
}

function viewNotificationAlert(item) {
  try {
    // Remove from dismissedAlerts if it exists so that the alert is not permanently hidden.
    dismissedAlerts = dismissedAlerts.filter(d => !(d.patientDbId === item.patientDbId && d.alertIndex === item.alertIndex));

    // Set the current patient index to the alert's patient
    currentPatientIndex = item.patientDbId;

    // Get the view alert modal element.
    const modalEl = document.getElementById("viewAlertModal");

    // Get all the elements we need to work with
    const patientInfoEl = document.getElementById("viewAlertPatientInfo");
    const typeEl = document.getElementById("viewAlertType");
    const allergiesContainerEl = document.getElementById("viewAlertAllergiesContainer");
    const allergiesEl = document.getElementById("viewAlertAllergies");
    const dueDateContainerEl = document.getElementById("viewAlertDueDateContainer");
    const dueDateEl = document.getElementById("viewAlertDueDate");
    const indicatorContainerEl = document.getElementById("viewAlertIndicatorContainer");
    const indicatorEl = document.getElementById("viewAlertIndicator");
    const suppressionContainerEl = document.getElementById("viewAlertSuppressionStatusContainer");
    const untilEl = document.getElementById("viewAlertUntil");

    // Set patient info
    if (patientInfoEl) patientInfoEl.textContent = `${item.patientId} - ${item.patientName}`;

    // Hide all specific field containers by default
    if (allergiesContainerEl) allergiesContainerEl.style.display = "none";
    if (dueDateContainerEl) dueDateContainerEl.style.display = "none";
    if (indicatorContainerEl) indicatorContainerEl.style.display = "none";
    if (suppressionContainerEl) suppressionContainerEl.style.display = "none";

    // Common field for all alert types: Alert Type
    if (typeEl) typeEl.textContent = item.alert.type || "";

    // SPECIFIC FIELDS FOR EACH ALERT TYPE

    // 1. For Medication Alert: show ONLY Allergies field prominently
    if (item.source === "dosing" || (item.alert.type && item.alert.type.includes("Medication"))) {
      // Get allergies from nursing history if available
      const patient = getPatients().find(p => p.id === item.patientDbId);
      let allergiesText = "—";
      if (patient && patient.nursingHistoryRecords && patient.nursingHistoryRecords.length > 0) {
        const allergies = patient.nursingHistoryRecords
          .map(record => record.allergies)
          .filter(allergies => allergies)
          .join(", ");

        if (allergies) {
          allergiesText = allergies;
        }
      }
      if (allergiesEl) allergiesEl.textContent = allergiesText;
      if (allergiesContainerEl) allergiesContainerEl.style.display = "block";
    }
    // 2. For CDSS Alert: show ONLY Alert Type and Suppression status
    else if (item.alert.category === "cdss" || item.source === "dosing") {
      // Show Alert Type (already shown above)

      // Always show Suppression status for CDSS alerts
      if (untilEl) untilEl.textContent = item.alert.suppressed ? item.alert.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 3. For Practice Created Alert: show ONLY Alert Type, Due Date, Indicator, and Suppression status
    else if (item.alert.category === "practice") {
      // Show Alert Type (already shown above)

      // Show Due Date
      if (dueDateEl) dueDateEl.textContent = item.alert.dateWhenDue || "";
      if (dueDateContainerEl) dueDateContainerEl.style.display = "block";

      // Show Indicator with appropriate color
      const indicatorColor = item.alert.indicator === "blue" ? "#007bff" :
                            item.alert.indicator === "red" ? "#dc3545" :
                            "#cccccc"; // Default to light gray if not set

      if (indicatorEl) indicatorEl.innerHTML =
        `<div style="width:20px; height:20px; background-color:${indicatorColor}; border-radius:3px; display:inline-block; vertical-align:middle;"></div>`;
      if (indicatorContainerEl) indicatorContainerEl.style.display = "block";

      // Always show Suppression status for Practice alerts
      if (untilEl) untilEl.textContent = item.alert.suppressed ? item.alert.untilWhen || "Not set" : "Not suppressed";
      if (suppressionContainerEl) suppressionContainerEl.style.display = "block";
    }
    // 4. For Registry Alert: show ONLY Alert Type
    else if (item.alert.category === "registry") {
      // Show Alert Type (already shown above)
      // No other fields should be shown
    }

    // Prepare footer buttons based on alert type
    let footerButtons = '';

    // Add action buttons based on alert type
    if (item.alert.category === "cdss") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editCdssAlert(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (item.alert.category === "practice") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editPracticeAlert(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    } else if (item.alert.category === "registry") {
      footerButtons += `<button class="btn btn-primary me-2" onclick="editRegistryAlert(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
        <i class="bi bi-pencil-fill me-1"></i> Edit
      </button>`;
    }

    // Add Suppress/Unsuppress button based on current state (except for registry alerts)
    if (item.alert.category !== "registry") {
      if (item.alert.suppressed) {
        footerButtons += `<button class="btn btn-success me-2" onclick="unsuppressAlert(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-fill me-1"></i> Unsuppress
        </button>`;
      } else {
        footerButtons += `<button class="btn btn-warning me-2" onclick="openSuppressModal(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
          <i class="bi bi-bell-slash-fill me-1"></i> Suppress
        </button>`;
      }
    }

    // Add Delete button
    footerButtons += `<button class="btn btn-danger me-2" onclick="deleteCdssAlert(${item.alertIndex}); bootstrap.Modal.getInstance(document.getElementById('viewAlertModal')).hide();">
      <i class="bi bi-trash-fill me-1"></i> Delete
    </button>`;

    // Add Close button
    footerButtons += `<button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;

    document.getElementById("viewAlertModalFooter").innerHTML = footerButtons;

    const viewModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    viewModal.show();
  } catch (error) {
    console.error("Error in viewNotificationAlert:", error);
  }
}

// When the notification icon is clicked, load notifications.
document.getElementById("notificationIcon").addEventListener("click", loadNotifications);

/// ====================
// Patient Info CRUD
// ====================

// Opens the Patient Info Modal, prefilling the fields based on the current patient's data.
async function openPatientInfoModal() {
  try {
    const patient = await db.patients.get(currentPatientIndex);
    if (!patient) {
      console.error("Patient not found");
      showAlert('Error: Patient not found', 'error');
      return;
    }

    // Populate view mode fields
    document.getElementById('pi_name').textContent = patient.name || '—';
    document.getElementById('pi_birthday').textContent = patient.birthdate || '—';
    document.getElementById('pi_age').textContent = patient.age || '—';
    document.getElementById('pi_gender').textContent = patient.gender || '—';
    document.getElementById('pi_weight').textContent = patient.weight || '—';
    document.getElementById('pi_height').textContent = patient.height || '—';
    document.getElementById('pi_ethnicity').textContent = patient.ethnicity || '—';
    document.getElementById('pi_contact').textContent = patient.contact || '—';

    // Populate edit mode fields (hidden initially)
    document.getElementById('patientInfoId').value = patient.id;
    document.getElementById('patientName').value = patient.name || '';

    // Format the birthdate properly for the date input
    let birthdateValue = '';
    if (patient.birthdate) {
      // Try to parse the date and format it as YYYY-MM-DD for the date input
      try {
        const parts = patient.birthdate.split('/');
        if (parts.length === 3) {
          // If format is MM/DD/YYYY
          birthdateValue = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        } else {
          birthdateValue = patient.birthdate;
        }
      } catch (e) {
        birthdateValue = patient.birthdate;
      }
    }

    document.getElementById('patientBirthday').value = birthdateValue;
    document.getElementById('patientAge').value = patient.age || '';
    document.getElementById('patientGender').value = patient.gender || '';

    // Extract numeric values from weight and height if they exist
    let weightValue = '';
    let heightValue = '';

    if (patient.weight) {
      // Extract numeric value from string like "70 kg"
      const weightMatch = patient.weight.match(/^(\d+(?:\.\d+)?)/);
      if (weightMatch) {
        weightValue = weightMatch[1];
      } else {
        weightValue = patient.weight.replace(' kg', '');
      }
    }

    if (patient.height) {
      // Extract numeric value from string like "175 cm"
      const heightMatch = patient.height.match(/^(\d+(?:\.\d+)?)/);
      if (heightMatch) {
        heightValue = heightMatch[1];
      } else {
        heightValue = patient.height.replace(' cm', '');
      }
    }

    // Populate editable fields
    document.getElementById('patientWeight').value = weightValue;
    document.getElementById('patientHeight').value = heightValue;
    document.getElementById('patientEthnicity').value = patient.ethnicity || '';
    document.getElementById('patientContact').value = patient.contact || '';

    // Make sure we're in edit mode directly
    document.getElementById('patientInfoViewMode').style.display = 'none';
    document.getElementById('patientInfoEditMode').style.display = 'block';
    document.getElementById('patientInfoViewButtons').style.display = 'none';
    document.getElementById('patientInfoEditButtons').style.display = 'block';

    // Make sure only weight, height, ethnicity, and contact are editable
    document.getElementById('patientName').disabled = true;
    document.getElementById('patientBirthday').disabled = true;
    document.getElementById('patientAge').disabled = true;
    document.getElementById('patientGender').disabled = true;

    // Enable the editable fields
    document.getElementById('patientWeight').disabled = false;
    document.getElementById('patientHeight').disabled = false;
    document.getElementById('patientEthnicity').disabled = false;
    document.getElementById('patientContact').disabled = false;

    // Open the modal
    const modalEl = document.getElementById('patientInfoModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } catch (error) {
    console.error("Error opening patient info modal:", error);
    showAlert('Error opening patient information. Please try again.', 'error');
  }
}

// Switch to edit mode in the patient info modal
function switchToEditMode() {
  console.log("Switching to edit mode");

  // For patient info modal
  if (document.getElementById('patientInfoViewMode')) {
    // Show edit mode, hide view mode
    document.getElementById('patientInfoViewMode').style.display = 'none';
    document.getElementById('patientInfoEditMode').style.display = 'block';
    document.getElementById('patientInfoViewButtons').style.display = 'none';
    document.getElementById('patientInfoEditButtons').style.display = 'block';

    // Make sure only weight, height, ethnicity, and contact are editable
    // Name, birthday, age, and gender should remain disabled
    document.getElementById('patientName').disabled = true;
    document.getElementById('patientBirthday').disabled = true;
    document.getElementById('patientAge').disabled = true;
    document.getElementById('patientGender').disabled = true;

    // Enable only the fields that should be editable
    document.getElementById('patientWeight').disabled = false;
    document.getElementById('patientHeight').disabled = false;
    document.getElementById('patientEthnicity').disabled = false;
    document.getElementById('patientContact').disabled = false;

    console.log("Edit mode enabled. Editable fields:",
      document.getElementById('patientWeight').disabled,
      document.getElementById('patientHeight').disabled,
      document.getElementById('patientEthnicity').disabled,
      document.getElementById('patientContact').disabled
    );
  }

  // For medication modal
  if (document.getElementById('medViewContent')) {
    document.getElementById('medViewContent').style.display = 'none';
    document.getElementById('medEditContent').style.display = 'block';
    document.getElementById('medViewButtons').style.display = 'none';
    document.getElementById('medEditButtons').style.display = 'block';
  }
}

// Switch to view mode in the patient info modal
function switchToViewMode() {
  // For patient info modal
  if (document.getElementById('patientInfoViewMode')) {
    document.getElementById('patientInfoViewMode').style.display = 'block';
    document.getElementById('patientInfoEditMode').style.display = 'none';
    document.getElementById('patientInfoViewButtons').style.display = 'block';
    document.getElementById('patientInfoEditButtons').style.display = 'none';
  }

  // For medication modal
  if (document.getElementById('medViewContent')) {
    document.getElementById('medViewContent').style.display = 'block';
    document.getElementById('medEditContent').style.display = 'none';
    document.getElementById('medViewButtons').style.display = 'block';
    document.getElementById('medEditButtons').style.display = 'none';
  }
}


// Saves the edits made in the Patient Info Modal back to the patient record.
async function savePatientInfo() {
  try {
    const patient = await db.patients.get(currentPatientIndex);
    if (!patient) {
      console.error("Patient not found");
      showAlert('Error: Patient not found', 'error');
      return;
    }

    // Get values from the correct input fields in the modal
    const weightValue = document.getElementById('patientWeight').value.trim();
    const heightValue = document.getElementById('patientHeight').value.trim();
    const ethnicityValue = document.getElementById('patientEthnicity').value.trim();
    const contactValue = document.getElementById('patientContact').value.trim();

    // Update the patient record with the new values
    patient.weight = weightValue ? weightValue + ' kg' : '';
    patient.height = heightValue ? heightValue + ' cm' : '';
    patient.ethnicity = ethnicityValue;
    patient.contact = contactValue;

    // Save the updated patient record to the database
    await db.patients.put(patient);

    // Update the patients cache
    await loadPatientsFromDB();

    // Update the view mode fields
    document.getElementById('pi_weight').textContent = patient.weight || '—';
    document.getElementById('pi_height').textContent = patient.height || '—';
    document.getElementById('pi_ethnicity').textContent = patient.ethnicity || '—';
    document.getElementById('pi_contact').textContent = patient.contact || '—';

    // Refresh the patient info display to ensure it shows the latest data
    refreshPatientInfoDisplay();

    // Close the modal
    const modalEl = document.getElementById('patientInfoModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }

    // Show success message
    showAlert('Patient information updated successfully!', 'success');
  } catch (error) {
    console.error("Error saving patient info:", error);
    showAlert('Error saving patient information. Please try again.', 'error');
  }
}

// Deletes (clears) the extra patient information (weight, height, ethnicity, and contact).
async function deletePatientInfo() {
  try {
    if (!confirm("Are you sure you want to delete the extra patient information?")) return;

    const patient = await db.patients.get(currentPatientIndex);
    if (!patient) {
      console.error("Patient not found");
      showAlert('Error: Patient not found', 'error');
      return;
    }

    // Clear the extra fields.
    patient.weight = '';
    patient.height = '';
    patient.ethnicity = '';
    patient.contact = '';

    // Save the updated patient record to the database
    await db.patients.put(patient);

    // Update the patients cache
    await loadPatientsFromDB();

    // Clear the form fields
    document.getElementById('patientWeight').value = '';
    document.getElementById('patientHeight').value = '';
    document.getElementById('patientEthnicity').value = '';
    document.getElementById('patientContact').value = '';

    // Update the view mode fields
    document.getElementById('pi_weight').textContent = '—';
    document.getElementById('pi_height').textContent = '—';
    document.getElementById('pi_ethnicity').textContent = '—';
    document.getElementById('pi_contact').textContent = '—';

    // Refresh the patient info display to ensure it shows the latest data
    refreshPatientInfoDisplay();

    // Close the modal
    const modalEl = document.getElementById('patientInfoModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }

    // Show success message
    showAlert('Patient information cleared successfully!', 'success');
  } catch (error) {
    console.error("Error clearing patient info:", error);
    showAlert('Error clearing patient information. Please try again.', 'error');
  }
}

// Refreshes the Patient Info display on the main tab by reloading data from IndexedDB.
async function refreshPatientInfoDisplay() {
  const patient = await db.patients.get(currentPatientIndex);
  if (!patient) return;

  try {
    // Check if the patient info display elements exist before updating them
    if (document.getElementById('pi_name')) {
      document.getElementById('pi_name').innerText = patient.name || '—';
      document.getElementById('pi_birthday').innerText = patient.birthdate || '—';
      document.getElementById('pi_age').innerText = patient.age || '—';
      document.getElementById('pi_weight').innerText = patient.weight || '—';
      document.getElementById('pi_height').innerText = patient.height || '—';
      document.getElementById('pi_ethnicity').innerText = patient.ethnicity || '—';
      document.getElementById('pi_contact').innerText = patient.contact || '—';
    }
  } catch (error) {
    console.log("Patient info display elements not found, skipping refresh");
  }
}
// Function to enable editing of patient information (weight, height, ethnicity, contact)
function enablePatientInfoEditing() {
  console.log("Enabling patient info editing");
  // Call switchToEditMode to show the edit form and enable only the editable fields
  switchToEditMode();
}

function loadDosingAlertsDisplay() {
    const container = document.getElementById("dosingAlertsTableBody");
    container.innerHTML = "";
    const patient = getPatients().find(p => p.id === currentPatientIndex);

    if (patient && patient.dosingAlertsRecords && patient.dosingAlertsRecords.length > 0) {
      let html = "";
      patient.dosingAlertsRecords.forEach((alert, i) => {
        html += `
          <tr>
            <td>${alert.type || ""}</td>
            <td>${alert.description || ""}</td>
            <td>
              <button class="btn btn-info btn-sm me-1" style="background-color: #5a87c2; border: none; color: white;" onclick="viewDosingAlert(${i})">
                <i class="bi bi-eye-fill me-1"></i> View
              </button>
              ${createActionButton('delete', `deleteDosingAlert(${i})`)}
            </td>
          </tr>
        `;
      });
      container.innerHTML = html;
      document.getElementById("emptyDosingAlerts").style.display = "none";
    } else {
      container.innerHTML = "";
      document.getElementById("emptyDosingAlerts").style.display = "block";
    }
  }

  async function deleteDosingAlert(index) {
    if (!confirm("Are you sure you want to delete this dosing alert?")) return;

    try {
      const patient = getPatients().find(p => p.id === currentPatientIndex);
      if (!patient || !patient.dosingAlertsRecords) {
        showAlert("Patient or dosing alerts not found", "error");
        return;
      }

      // Get the alert before deleting it (for logging purposes)
      const alertToDelete = patient.dosingAlertsRecords[index];
      console.log("Deleting dosing alert:", alertToDelete);

      // Remove the alert
      patient.dosingAlertsRecords.splice(index, 1);

      // Save the updated patient data
      await db.patients.put(patient);

      // Refresh the displays
      loadDosingAlertsDisplay();
      updateAlertsBadge();
      loadNotifications();

      // Show success message
      showAlert("Dosing alert deleted successfully!", "success");
    } catch (error) {
      console.error("Error deleting dosing alert:", error);
      showAlert("Error deleting dosing alert: " + (error.message || "Unknown error"), "error");
    }
  }

// Function to initialize all tabs
function initializeTabs() {
    // Get all tab elements
    const tabs = document.querySelectorAll('[data-bs-toggle="tab"]');

    // Add click event listener to each tab
    tabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(event) {
            const targetId = event.target.getAttribute('href');
            switch(targetId) {
                case '#patientInfoTab':
                    refreshPatientInfoDisplay();
                    break;
                case '#nursingHistoryTab':
                    loadNursingHistoryRecordsDisplay();
                    break;
                case '#medicalRecordsTab':
                    loadMedicalRecords();
                    break;
                case '#medicationTab':
                    loadMedicationTable();
                    break;
                case '#diagnosisTab':
                    loadDiagnosisTable();
                    break;
                case '#planningTab':
                    loadPlanningTable();
                    break;
                case '#reconciliationTab':
                    loadReconciliationTable();
                    break;
                case '#marTab':
                    loadMARRecordsDisplay();
                    break;
                case '#nursingNotesTab':
                    loadNursingNotesTable();
                    break;
                case '#payBillsTab':
                    loadPayBillsTable();
                    break;
                case '#appointmentTab':
                    loadAppointmentTable();
                    break;
                case '#cdssTab':
                    loadCdssAlerts();
                    break;
                case '#tprIoTab':
                    loadTprIoTable();
                    break;
            }
        });
    });
}

// Modify the viewPatient function to initialize tabs after loading patient data
async function viewPatient(id) {
    const patient = await db.patients.get(id);
    if (!patient) return;

    currentPatientIndex = id;
    currentPatient = patient; // Store the current patient data

    // Update patient details display
    document.getElementById("viewPatientId").innerText = patient.patientId;
    document.getElementById("viewPatientName").innerText = patient.name;
    document.getElementById("viewPatientBirthdate").innerText = patient.birthdate;
    document.getElementById("viewPatientGender").innerText = patient.gender;
    document.getElementById("viewPatientAge").innerText = patient.age;

    // Initialize all data tables
    refreshPatientInfoDisplay();
    loadNursingHistoryRecordsDisplay();
    loadMedicalRecords();
    loadMedicationTable();
    loadDiagnosisTable();
    // Treatment tab has been removed
    loadPlanningTable();
    loadReconciliationTable();
    loadMARRecordsDisplay();
    loadNursingNotesTable();
    loadPayBillsTable();
    loadAppointmentTable();
    loadCdssAlerts();
    loadPatients();
    loadNotifications();
    loadDosingAlertsDisplay();

    // Note: TPR/I&O data will only be loaded when the tab is clicked

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById("viewPatientModal"));
    modal.show();

    // Initialize tabs after modal is shown
    initializeTabs();
}

// Add event listener for when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap components
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize tabs
    initializeTabs();

    // Initialize medication modal date picker
    const medicationModal = document.getElementById('medicationModal');
    if (medicationModal) {
        medicationModal.addEventListener('show.bs.modal', function() {
            // Set up date picker for medication modal
            const dateInput = document.getElementById("medDate");
            if (dateInput) {
                // Add calendar icon click handler
                const calendarIcon = dateInput.parentElement.querySelector('.bi-calendar');
                if (calendarIcon) {
                    calendarIcon.addEventListener('click', function() {
                        dateInput.focus();
                    });
                }
            }
        });
    }
});

// Welcome Screen Transition
document.addEventListener('DOMContentLoaded', function() {
  const welcomeScreen = document.getElementById('welcomeScreen');

  // Hide welcome screen after 3 seconds
  setTimeout(() => {
    welcomeScreen.classList.add('fade-out');

    // Remove welcome screen from DOM after fade out animation
    setTimeout(() => {
      welcomeScreen.style.display = 'none';
    }, 500);
  }, 3000);
});

function viewNursingHistoryRecord(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const record = patient?.nursingHistoryRecords[index];
  if (!record) return;

  document.getElementById("nursingHistoryIndex").value = index;
  document.getElementById("nursingHistoryPresent").value = record.presentIllness || "";
  document.getElementById("nursingHistoryPast").value = record.pastIllness || "";
  document.getElementById("nursingHistoryFamily").value = record.familyHistory || "";
  document.getElementById("nursingHistoryAllergies").value = record.allergies || "";
  document.getElementById("pastImmunization").value = record.pastImmunization || "";

  document.getElementById("nursingHistoryPresent").disabled = true;
  document.getElementById("nursingHistoryPast").disabled = true;
  document.getElementById("nursingHistoryFamily").disabled = true;
  document.getElementById("nursingHistoryAllergies").disabled = true;
  document.getElementById("pastImmunization").disabled = true;

  document.getElementById("nursingHistorySaveBtn").style.display = "none";
  document.getElementById("nursingHistoryDeleteBtn").style.display = "none";

  new bootstrap.Modal(document.getElementById("nursingHistoryModal")).show();
}

function editNursingHistoryRecord(index) {
  const patient = getPatients().find(p => p.id === currentPatientIndex);
  const record = patient?.nursingHistoryRecords[index];
  if (!record) return;

  document.getElementById("nursingHistoryIndex").value = index;
  document.getElementById("nursingHistoryPresent").value = record.presentIllness || "";
  document.getElementById("nursingHistoryPast").value = record.pastIllness || "";
  document.getElementById("nursingHistoryFamily").value = record.familyHistory || "";
  document.getElementById("nursingHistoryAllergies").value = record.allergies || "";
  document.getElementById("pastImmunization").value = record.pastImmunization || "";

  document.getElementById("nursingHistoryPresent").disabled = false;
  document.getElementById("nursingHistoryPast").disabled = false;
  document.getElementById("nursingHistoryFamily").disabled = false;
  document.getElementById("nursingHistoryAllergies").disabled = false;
  document.getElementById("pastImmunization").disabled = false;

  document.getElementById("nursingHistorySaveBtn").style.display = "inline-block";
  document.getElementById("nursingHistoryDeleteBtn").style.display = "inline-block";

  new bootstrap.Modal(document.getElementById("nursingHistoryModal")).show();
}

/*********************************************************
  BULK PATIENT MANAGEMENT
**********************************************************/
// Selected patient IDs for bulk operations
let selectedPatientIds = [];

// Load patients into the manage patients modal
async function loadManagePatients() {
  const allPatients = getPatients();
  const tableBody = document.getElementById("managePatientTableBody");
  tableBody.innerHTML = "";

  // Reset selected patients
  selectedPatientIds = [];
  updateDeleteButtonState();

  // Show/hide empty message
  document.getElementById("emptyManagePatientMessage").style.display =
    allPatients.length === 0 ? "block" : "none";

  // Populate table with all patients
  allPatients.forEach(patient => {
    tableBody.innerHTML += `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input patient-checkbox"
                 data-patient-id="${patient.id}">
        </td>
        <td>${patient.patientId}</td>
        <td>${patient.name}</td>
        <td>${patient.gender}</td>
        <td>${patient.age}</td>
        <td>${patient.roomNo}</td>
        <td>${patient.status}</td>
      </tr>
    `;
  });

  // Add event listeners to checkboxes after they're created
  document.querySelectorAll('.patient-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const patientId = parseInt(this.getAttribute('data-patient-id'));
      togglePatientSelection(patientId);
    });
  });
}

// Toggle selection of a patient
function togglePatientSelection(patientId) {
  const index = selectedPatientIds.indexOf(patientId);
  if (index === -1) {
    // Add to selected
    selectedPatientIds.push(patientId);
  } else {
    // Remove from selected
    selectedPatientIds.splice(index, 1);
  }

  // Update the "Select All" checkbox state
  updateSelectAllCheckbox();

  // Update delete button state
  updateDeleteButtonState();
}

// Select all patients
function selectAllPatients() {
  const allPatients = getPatients();
  const checkboxes = document.querySelectorAll('.patient-checkbox');

  // Check all checkboxes
  checkboxes.forEach(checkbox => {
    checkbox.checked = true;
  });

  // Update selected IDs array
  selectedPatientIds = allPatients.map(patient => patient.id);

  // Update the select all checkbox
  document.getElementById('selectAllCheckbox').checked = true;

  // Update delete button state
  updateDeleteButtonState();
}

// Deselect all patients
function deselectAllPatients() {
  const checkboxes = document.querySelectorAll('.patient-checkbox');

  // Uncheck all checkboxes
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });

  // Clear selected IDs array
  selectedPatientIds = [];

  // Update the select all checkbox
  document.getElementById('selectAllCheckbox').checked = false;

  // Update delete button state
  updateDeleteButtonState();
}

// Update the state of the "Select All" checkbox based on individual selections
function updateSelectAllCheckbox() {
  const allPatients = getPatients();
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  if (selectedPatientIds.length === allPatients.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedPatientIds.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.indeterminate = true;
  }
}

// Update the state of the delete button based on selections
function updateDeleteButtonState() {
  const deleteButton = document.getElementById('deleteSelectedPatientsBtn');
  deleteButton.disabled = selectedPatientIds.length === 0;
}

// Delete selected patients
async function deleteSelectedPatients() {
  if (selectedPatientIds.length === 0) {
    showAlert("No patients selected for deletion.", "warning");
    return;
  }

  const count = selectedPatientIds.length;
  if (!confirm(`Are you sure you want to delete ${count} selected patient(s)? This action cannot be undone.`)) {
    return;
  }

  try {
    showLoader();

    // Make a copy of the IDs to reference in the success message
    const deletedCount = selectedPatientIds.length;

    // Delete each selected patient
    for (const id of selectedPatientIds) {
      await db.patients.delete(id);
    }

    // Reload patients from database
    await loadPatientsFromDB();

    // Clear selection
    selectedPatientIds = [];

    // Refresh the UI
    loadPatients();

    // Check if there are any patients left
    const remainingPatients = getPatients();
    if (remainingPatients.length === 0) {
      // If no patients left, close the modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('managePatientModal'));
      if (modal) {
        modal.hide();
      }
    } else {
      // Otherwise refresh the manage patients table
      loadManagePatients();
    }

    hideLoader();
    showAlert(`Successfully deleted ${deletedCount} patient(s).`, "success");

  } catch (error) {
    hideLoader();
    console.error("Error deleting patients:", error);
    showAlert("There was a problem deleting the selected patients. Please try again.", "error");
  }
}

// Handle the "Select All" checkbox in the header
function toggleSelectAllPatients() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  // Use setTimeout to ensure this runs after the checkbox state has changed
  setTimeout(() => {
    if (selectAllCheckbox.checked) {
      selectAllPatients();
    } else {
      deselectAllPatients();
    }
  }, 0);
}

// Event listeners for the manage patients modal
document.addEventListener("DOMContentLoaded", function() {
  // Initialize the manage patients modal when it's shown
  const managePatientModal = document.getElementById('managePatientModal');
  if (managePatientModal) {
    managePatientModal.addEventListener('show.bs.modal', function() {
      loadManagePatients();

      // Set up event listeners for buttons after modal is shown
      setupManagePatientsEventListeners();
    });
  }
});

// Setup event listeners for the manage patients modal
function setupManagePatientsEventListeners() {
  // Set up event listeners for buttons
  const selectAllBtn = document.getElementById('selectAllPatientsBtn');
  if (selectAllBtn) {
    // Remove any existing event listeners
    selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
    // Get the fresh element
    const freshSelectAllBtn = document.getElementById('selectAllPatientsBtn');
    freshSelectAllBtn.addEventListener('click', selectAllPatients);
  }

  const deselectAllBtn = document.getElementById('deselectAllPatientsBtn');
  if (deselectAllBtn) {
    // Remove any existing event listeners
    deselectAllBtn.replaceWith(deselectAllBtn.cloneNode(true));
    // Get the fresh element
    const freshDeselectAllBtn = document.getElementById('deselectAllPatientsBtn');
    freshDeselectAllBtn.addEventListener('click', deselectAllPatients);
  }

  const deleteSelectedBtn = document.getElementById('deleteSelectedPatientsBtn');
  if (deleteSelectedBtn) {
    // Remove any existing event listeners
    deleteSelectedBtn.replaceWith(deleteSelectedBtn.cloneNode(true));
    // Get the fresh element
    const freshDeleteSelectedBtn = document.getElementById('deleteSelectedPatientsBtn');
    freshDeleteSelectedBtn.addEventListener('click', deleteSelectedPatients);
  }

  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    // Remove any existing event listeners
    selectAllCheckbox.replaceWith(selectAllCheckbox.cloneNode(true));
    // Get the fresh element
    const freshSelectAllCheckbox = document.getElementById('selectAllCheckbox');
    freshSelectAllCheckbox.addEventListener('change', toggleSelectAllPatients);
  }
}
