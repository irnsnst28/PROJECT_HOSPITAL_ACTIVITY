document.addEventListener('DOMContentLoaded', () => {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const landingPage = document.getElementById('landingPage');
    const loginPage = document.getElementById('loginPage');
    
    // Initially hide the landing page and login page
    if (landingPage) {
        landingPage.style.display = 'none';
    }
    if (loginPage) {
        loginPage.style.display = 'none';
    }
    
    // Show welcome screen
    if (welcomeScreen) {
        welcomeScreen.style.display = 'flex';
    }
    
    // Hide welcome screen after 3 seconds and show landing page
    setTimeout(() => {
        if (welcomeScreen) {
            welcomeScreen.classList.add('fade-out');
        }
        
        // Show landing page
        if (landingPage) {
            landingPage.style.display = 'flex';
        }
        
        // Remove welcome screen from DOM after fade out animation
        setTimeout(() => {
            if (welcomeScreen) {
                welcomeScreen.remove();
            }
        }, 500);
    }, 3000);
});

// Function to show login page (only called when user clicks the login button)
function showLoginPage() {
    const landingPage = document.getElementById('landingPage');
    const loginPage = document.getElementById('loginPage');
    
    if (landingPage && loginPage) {
        landingPage.style.display = 'none';
        loginPage.style.display = 'flex';
    }
} 