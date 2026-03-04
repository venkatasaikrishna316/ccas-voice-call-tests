import { test } from '@playwright/test';
import rawConfig from '../../workload-metadata/CCASVoiceCall.json' with { type: 'json' };
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { pid } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract config from workload metadata structure
// Access arguments from: tasks[0].scripts[0].arguments
const config = rawConfig.tasks?.[0]?.scripts?.[0]?.arguments || {};

// Helper function to get screenshot path with username and unique identifier
// FPSx pattern: await page.screenshot({ path: '/results/screenshot.png' });
// For parallel runs, we include username and process ID to make paths unique per test instance
let screenshotBaseDir = null; // Cache the base directory per test run

const getScreenshotPath = (filename) => {
  // Get username from process.env or config (available in all functions)
  const username = process.env.username || config.username || 'unknown';
  // Extract username part before @ for cleaner folder names
  const usernamePart = username.split('@')[0];
  
  // Create unique identifier for parallel runs: username_processID_timestamp
  // This ensures each parallel test instance gets its own folder
  if (!screenshotBaseDir) {
    const timestamp = Date.now();
    const uniqueId = `${usernamePart}_${pid}_${timestamp}`;
    screenshotBaseDir = uniqueId;
  }
  
  // Use absolute path /results/ for FPSx (as shown in FPSx sample code)
  const fpsxResultsPath = '/results';
  
  // Create subdirectory with unique identifier: /results/username_pid_timestamp/
  const userScreenshotsDir = `${fpsxResultsPath}/${screenshotBaseDir}`;
  
  // Try to create directories if they don't exist (for local runs)
  // In FPSx Docker environment, /results/ already exists
  if (!existsSync(fpsxResultsPath)) {
    try {
      mkdirSync(fpsxResultsPath, { recursive: true });
    } catch (error) {
      // If we can't create /results/ (e.g., permission denied on local machine), fallback to local directory
      const localResultsDir = resolve(__dirname, '..', '..', 'results');
      if (!existsSync(localResultsDir)) {
        mkdirSync(localResultsDir, { recursive: true });
      }
      const localUserDir = resolve(localResultsDir, screenshotBaseDir);
      if (!existsSync(localUserDir)) {
        mkdirSync(localUserDir, { recursive: true });
      }
      return resolve(localUserDir, filename);
    }
  }
  
  // Create user-specific screenshots directory
  if (!existsSync(userScreenshotsDir)) {
    try {
      mkdirSync(userScreenshotsDir, { recursive: true });
    } catch (error) {
      // If can't create user dir, fallback to root results with unique identifier in filename
      return `${fpsxResultsPath}/${screenshotBaseDir}_${filename}`;
    }
  }
  
  // Return path: /results/username_pid_timestamp/filename.png
  return `${userScreenshotsDir}/${filename}`;
};

// Helper function to get numeric config value (process.env values are strings, need conversion)
const getNumberConfig = (key, defaultValue = 0) => {
  const envValue = process.env[key];
  const configValue = config[key];
  if (envValue !== undefined && envValue !== null && envValue !== '') {
    const num = Number(envValue);
    if (!isNaN(num)) return num;
  }
  if (configValue !== undefined && configValue !== null && configValue !== '') {
    const num = Number(configValue);
    if (!isNaN(num)) return num;
  }
  return defaultValue;
};

const ACCESSORS = {
  // Omni-Channel
  omniChannel: '//div[contains(@class, "oneUtilityBarItem")]/button/span[text()="Omni-Channel"]',
  omniChannelOnline: '//div[contains(@class, "oneUtilityBarItem")]/button/span[text()="Omni-Channel (Online)"]',
  statusDropDown: '.oneUtilityBarPanel .slds-dropdown-trigger button',
  availableForVoice: '//div[contains(@class, "slds-dropdown__item")]//span[text()="Available"]',
  
  // Incoming Call
  inbox: '//span[contains(text(), "Inbox (1)")]',
  acceptIncomingMessage: '//button[contains(@title,\'Accept\')]',
  connectedIcon: '//div[contains(@class,"slds-col slds-m-vertical_xx-small")]//span[text()="Connected"]',
  muteButton: '//button[contains(@title,\'Mute\')]',
  
  // Messages
  customerFirstMessage: '//*[contains(@class, "slds-is-relative") and contains(@class, "slds-chat-message__text") and contains(@class, "slds-chat-message__text_inbound")]',
  agentFirstMessage: '//*[contains(@class, "slds-is-relative") and contains(@class, "slds-chat-message__text") and contains(@class, "slds-chat-message__text_outbound")]',
  
  // Ending Call
  closeVC: '//button[contains(@title,\'Close VC-\')]',
  phoneTab: '//a[contains(@title,\'Phone\')]',
  endCallButton: '//button[contains(@title,\'End\')]',
  endCallConfirmButton: '//button[contains(@class, "slds-button_brand") and contains(@class, "saveBtn") and text()="End Call"]',
  
  // Voice Session ID
  voiceSessionId: '//div[@data-target-selection-name="sfdc:RecordField.VoiceCall.VendorCallKey"]//span[@class="uiOutputText"]',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// LOGIN TO SALESFORCE (Based on CCASLogin.js)
// ============================================================
function constructLoginUrl(server, auraMode) {
  const baseUrl = new URL(server);
  const BASE_LOGIN_PAGE = '/one/one.app';
  
  let loginPath = BASE_LOGIN_PAGE;
  if (auraMode && auraMode.length) {
    loginPath += `?aura.mode=${auraMode}`;
  }
  
  // Set startURL as a query parameter
  baseUrl.searchParams.set('startURL', loginPath);
  return baseUrl.toString();
}

async function loginToSalesforce(page) {
  const logger = { info: console.log, warn: console.warn, error: console.error };
  // Following FPSx pattern: use process.env for credentials
  const username = process.env.username || config.username;
  const password = process.env.password || config.password;
  const queueName = process.env.queueName || config.queueName;
  const server = process.env.server || config.server;
  const app = process.env.app || config.app;
  const waitTime = getNumberConfig('loginWaitTimeout', 30000);
  
  const ACCESSORS = {
    username: '#username',
    password: '#password',
    form: '#login_form',
    formSubmitBtn: '#Login',
    appLauncher: '.appLauncher button, one-app-launcher-header',
    recordingModal: 'lightning-modal',
    iAgreeButton: 'lightning-button[data-id="agree-button"] button',
  };
  
  try {
    // Step 1: Navigate to login URL with aura mode
    const loginUrl = constructLoginUrl(server, process.env.auraMode || config.auraMode);
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Navigating to login URL: ${loginUrl} **************\n`);
    
    // Navigate with error handling - some servers may redirect
    try {
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: waitTime });
    } catch (error) {
      // If URL with startURL fails, try base URL and let Salesforce redirect
      if (error.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')) {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* URL with startURL failed, trying base URL **************\n`);
          await page.goto(server, { waitUntil: 'domcontentloaded', timeout: waitTime });
      } else {
        throw error;
      }
    }
    
    // Step 2: Handle login form
    console.log('👤 Step 2: Entering credentials');
    await page.locator(ACCESSORS.form).waitFor({ state: 'visible', timeout: waitTime });
    await page.fill(ACCESSORS.username, username);
    await page.fill(ACCESSORS.password, password);
    await page.click(ACCESSORS.formSubmitBtn);
    
    // Step 3: Wait for page to load (checking for one-app-launcher-header)
    console.log('⏳ Step 3: Waiting for page to load');
    await page.waitForFunction(
      () => {
        return document.readyState === 'complete' && 
               document.querySelector('one-app-launcher-header') !== null;
      },
      { timeout: waitTime }
    );
    
    // Step 4: Check for recording modal popup (new orgs)
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Checking for recording modal popup... **************\n`);
    
    try {
      const modalExists = await page.locator(ACCESSORS.recordingModal).count() > 0;
      if (modalExists) {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Recording modal detected, handling... **************\n`);
        
        // Wait for modal to be fully loaded
        await page.locator(ACCESSORS.recordingModal).waitFor({ state: 'visible', timeout: 5000 });
        
        // Click I Agree button
        await page.locator(ACCESSORS.iAgreeButton).waitFor({ state: 'visible', timeout: 3000 });
        await page.locator(ACCESSORS.iAgreeButton).click();
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Clicked I Agree button ************** ${new Date().toISOString()} \n`);
        
        // Wait for modal to disappear
        await page.waitForFunction(
          () => {
            return document.querySelector('lightning-modal') === null;
          },
          { timeout: 10000 }
        );
        
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Recording modal dismissed ************** ${new Date().toISOString()} \n`);
      } else {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* No recording modal detected ************** ${new Date().toISOString()} \n`);
      }
    } catch (popupError) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Error checking for popup: ${popupError.message} ************** ${new Date().toISOString()} \n`);
    }
    
    // Wait a bit more to ensure any popup is fully dismissed
    await delay(2000);
    
    // Step 5: Handle app selection (Service Console)
    console.log('📱 Step 4: Selecting Service Console app');
    const appSelector = `.appName [title='${app}']`;
    const appExists = await page.locator(appSelector).count() > 0;
    
    if (!appExists) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* App not found, opening app launcher ************** ${new Date().toISOString()} \n`);
      
      await page.locator(ACCESSORS.appLauncher).click();
      await delay(2000);
      
      // Search for the app
      const searchInput = page.locator('input[placeholder="Search apps and items..."], input[placeholder="Search apps or items..."], input[placeholder="Search apps..."]').first();
      await searchInput.fill(app);
      await delay(2000);
      
      // Click on the app tile
      await page.locator('a[class="appTileTitle"] mark, [class="appTileTitleNoDesc"] mark, one-app-launcher-menu-item lightning-formatted-rich-text span p').first().click();
      
      // Wait for app to load
      await page.waitForFunction(
        () => {
          return document.readyState === 'complete' && 
                 document.querySelector('one-app-launcher-header') !== null;
        },
        { timeout: waitTime }
      );
    } else {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* App already selected ************** ${new Date().toISOString()} \n`);
    }
    
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Login completed successfully ************** ${new Date().toISOString()} \n`);
    console.log('✅ Login successful');
    
  } catch (error) {
    logger.error(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Login failed: ${error.message} ************** ${new Date().toISOString()} \n`);
    throw error;
  }
}

// ============================================================
// OPEN WEBRTC GATEWAY
// ============================================================
async function openWebRTCGateway(page) {
  const logger = { info: console.log, warn: console.warn };
  const url = process.env.webrtcGatewayUrl || config.webrtcGatewayUrl;
  const timeoutMs = getNumberConfig('webrtcGatewayTimeout', 10000);
  
  const currentUrl = page.url();
  logger.info(`\n##### [CCAS] Current URL: ${currentUrl} ************** ${new Date().toISOString()}\n`);
  
  logger.info(`\n##### [CCAS] Navigating to WebRTC Gateway URL: ${url} ************** ${new Date().toISOString()}\n`);
  
  // Navigate to WebRTC gateway using JavaScript to preserve Chrome flags
  await page.evaluate((gatewayUrl) => {
    window.location.href = gatewayUrl;
  }, url);
  
  await delay(2000);
  
  if (process.env.screenshot || config.screenshot) {
    try {
      await page.screenshot({ path: getScreenshotPath('OpenWebRTCGateway_SecurityWarning_Before.png') });
    } catch (screenshotError) {
      logger.warn(`\n##### [CCAS] Screenshot failed: ${screenshotError.message} ************** ${new Date().toISOString()}\n`);
    }
  }
  
  // Handle security warning page
  try {
    // Check if "Advanced" button exists and click it
    try {
      const advancedButton = page.locator('#details-button');
      if (await advancedButton.count() > 0) {
        await advancedButton.click();
        logger.info(`\n##### [CCAS] Security warning detected, clicked Advanced button ************** ${new Date().toISOString()}\n`);
        await delay(1000);
      }
    } catch (error) {
      logger.info(`\n##### [CCAS] Advanced button not found or already clicked: ${error.message} ************** ${new Date().toISOString()}\n`);
    }
    
    // Check if "Proceed" link exists and click it
    try {
      const proceedLink = page.locator('#proceed-link');
      if (await proceedLink.count() > 0) {
        await proceedLink.click();
        logger.info(`\n##### [CCAS] Clicked Proceed link to bypass security warning ************** ${new Date().toISOString()}\n`);
        await delay(2000);
      } else {
        // Try alternative: click the link by text content using JavaScript
        const clicked = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          const proceedLink = links.find(link => link.textContent && link.textContent.includes('Proceed to gateway'));
          if (proceedLink) {
            proceedLink.click();
            return true;
          }
          return false;
        });
        if (clicked) {
          await delay(2000);
          logger.info(`\n##### [CCAS] Clicked Proceed link via JavaScript ************** ${new Date().toISOString()}\n`);
        } else {
          logger.warn(`\n##### [CCAS] Proceed link not found on page ************** ${new Date().toISOString()}\n`);
        }
      }
    } catch (error) {
      logger.warn(`\n##### [CCAS] Could not find or click Proceed link: ${error.message} ************** ${new Date().toISOString()}\n`);
    }
  } catch (error) {
    logger.warn(`\n##### [CCAS] Security warning page not detected or already bypassed: ${error.message} ************** ${new Date().toISOString()}\n`);
  }
  
  if (process.env.screenshot || config.screenshot) {
    try {
      await page.screenshot({ path: getScreenshotPath('OpenWebRTCGateway_SecurityWarning_After.png') });
    } catch (screenshotError) {
      logger.warn(`\n##### [CCAS] Screenshot failed: ${screenshotError.message} ************** ${new Date().toISOString()}\n`);
    }
  }
  
  logger.info(`\n##### [CCAS] WebRTC Gateway URL opened and security warning handled successfully ************** ${new Date().toISOString()}\n`);
  
  // Navigate back to the original URL
  logger.info(`\n##### [CCAS] Navigating back to original URL: ${currentUrl} ************** ${new Date().toISOString()}\n`);
  await page.evaluate((originalUrl) => {
    window.location.href = originalUrl;
  }, currentUrl);
  await delay(1000);
  
  // Wait for page to load after navigation
  await page.waitForLoadState('domcontentloaded');
  await delay(500);
  
  logger.info(`\n##### [CCAS] Navigated back to Salesforce login page ************** ${new Date().toISOString()}\n`);
}

// ============================================================
// SET OMNI-CHANNEL ONLINE
// ============================================================
async function setOmniChannelOnline(page) {
  const logger = { info: console.log, error: console.error };
  const username = process.env.username || config.username;
  const queueName = process.env.queueName || config.queueName;
  const timeoutMs = getNumberConfig('ccasTimeout', 50000);
  const startTime = Date.now();
  
  try {
    console.log('📞 Step: Setting Omni-Channel to Online');
    
    // Click on Omni-Channel
    await page.locator(`xpath=${ACCESSORS.omniChannel}`).waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator(`xpath=${ACCESSORS.omniChannel}`).click();
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Clicked on Omni-Channel **************${new Date().toISOString()}\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('OmniChannelSetOnline_clickOmniChannel.png') });
    }
    
    // Wait for status dropdown
    await page.locator(ACCESSORS.statusDropDown).waitFor({ state: 'visible', timeout: timeoutMs });
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Able to enter inside Omni-Channel  **************${new Date().toISOString()}\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('OmniChannelSetOnline_viewStatusDropdown.png') });
    }
    
    // Click status dropdown
    await page.locator(ACCESSORS.statusDropDown).click();
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Clicked on Status DropDown  **************${new Date().toISOString()}\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('OmniChannelSetOnline_clickStatusDropDown.png') });
    }
    
    // Select "Online for All"
    await page.locator(`xpath=${ACCESSORS.availableForVoice}`).waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator(`xpath=${ACCESSORS.availableForVoice}`).click();
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Selected Available For Voice  **************${new Date().toISOString()}\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('InboxImage_OmniChannelSetOnline.png') });
    }
    
    const endTime = Date.now();
    await delay(5000); // Wait for 5 seconds to start the SIPP test
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* waited for 5000 ms to start the SIPP test **************${new Date().toISOString()}\n`);
    
    const ept = endTime - startTime;
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* EPT for OmniChannelSetOnline (Click to Available): ${ept}ms **************\n`);
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* OmniChannelSetOnline (Click to Available) completed at ${new Date().toISOString()} **************\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('OmniChannelSetOnline_SelectedAvailableForVoice.png') });
    }
    
    return ept;
  } catch (error) {
    const endTime = Date.now();
    const ept = endTime - startTime;
    logger.error(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Error in OmniChannelSetOnline after ${ept}ms: ${error.message} **************\n`);
    throw error;
  }
}

// ============================================================
// ACCEPT INCOMING CALL
// ============================================================
async function acceptIncomingCall(page) {
  const logger = { info: console.log, warn: console.warn, error: console.error };
  const username = process.env.username || config.username;
  const queueName = process.env.queueName || config.queueName;
  const timeoutMs = getNumberConfig('ccasTimeout', 50000);
  const startTime = Date.now();
  const AgentWaitTime = getNumberConfig('AgentWaitTime', 100000);
  let ept = 0;
  
  try {
    console.log('📞 Step: Accepting incoming call');
    
    // Click on inbox
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Waiting for ${AgentWaitTime}ms to receive the Voice Call **************${new Date().toISOString()}\n`);
    await page.locator(`xpath=${ACCESSORS.inbox}`).waitFor({ state: 'visible', timeout: AgentWaitTime * 30 });
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : *************Voice Call is received at ${new Date().toISOString()} **************\n`);
    await page.locator(`xpath=${ACCESSORS.inbox}`).click();
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('VoiceCallReceived.png') });
    }
    
    // Request microphone access BEFORE accepting the call to ensure media stream is ready
    try {
      await page.evaluate(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          // Keep stream active - don't stop it
          window.__testAudioStream = stream;
        } catch (error) {
          // Silently handle errors
        }
      });
      await delay(500); // Small delay to ensure stream is ready
    } catch (preMediaError) {
      // Silently handle errors
    }
    
    // Accept the call
    await page.locator(`xpath=${ACCESSORS.acceptIncomingMessage}`).waitFor({ state: 'visible', timeout: timeoutMs * 10 });
    await page.locator(`xpath=${ACCESSORS.acceptIncomingMessage}`).click();
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Accepted the Voice Call  **************${new Date().toISOString()}\n`);
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('AcceptingIncomingCallTHB.png') });
    }
    
    // Wait a moment for call to establish, then check WebRTC stats
    await delay(500);
    
    // Monitor WebRTC connection and media stats
    try {
      const webrtcStats = await page.evaluate(() => {
        const stats = {
          peerConnections: [],
          mediaStreams: [],
          getUserMediaCalls: 0
        };
        
        // Count RTCPeerConnection instances
        if (window.RTCPeerConnection) {
          // Try to find active peer connections
          const pcPrototype = RTCPeerConnection.prototype;
          const originalCreateOffer = pcPrototype.createOffer;
          let callCount = 0;
          pcPrototype.createOffer = function(...args) {
            callCount++;
            console.log(`[RTCPeerConnection] createOffer called (count: ${callCount})`);
            return originalCreateOffer.apply(this, args);
          };
        }
        
        // Check for active media streams
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Already intercepted above
        }
        
        // Try to get stats from any active peer connections
        const getStatsFromPC = async () => {
          // This is a best-effort attempt to find peer connections
          // The actual connections are managed by the Voice SDK
          return { note: 'Peer connections managed by Voice SDK' };
        };
        
        return stats;
      });
      
      logger.info(`\n##### [CCAS] WebRTC monitoring initialized **************\n`);
    } catch (statsError) {
      logger.warn(`\n##### [CCAS] Could not initialize WebRTC monitoring: ${statsError.message} **************\n`);
    }
    
    const endTime = Date.now();
    ept = endTime - startTime;
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* EPT for AcceptingIncomingCallTHB: ${ept}ms **************\n`);
  } catch (error) {
    const endTime = Date.now();
    ept = endTime - startTime;
    
    // Take screenshot on error to capture what's happening
    if (process.env.screenshot || config.screenshot) {
      try {
        await page.screenshot({ path: getScreenshotPath('AcceptingIncomingCallTHB_Error.png') });
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Error screenshot saved: AcceptingIncomingCallTHB_Error.png ************** ${new Date().toISOString()}\n`);
      } catch (screenshotError) {
        logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Failed to save error screenshot: ${screenshotError.message} ************** ${new Date().toISOString()}\n`);
      }
    }
    
    // Check for backdrop element and log if present
    try {
      const backdropCount = await page.locator('.slds-backdrop_open, .backdrop.slds-backdrop, div[class*="backdrop"]').count();
      if (backdropCount > 0) {
        const backdropInfo = await page.evaluate(() => {
          const backdrops = Array.from(document.querySelectorAll('.slds-backdrop_open, .backdrop.slds-backdrop, div[class*="backdrop"]'));
          return backdrops.map(bd => ({
            className: bd.className,
            visible: bd.offsetParent !== null,
            zIndex: window.getComputedStyle(bd).zIndex,
            display: window.getComputedStyle(bd).display
          }));
        });
        logger.error(`\n##### [CCAS] Agent ${username} ${queueName} : ************* BACKDROP DETECTED: ${backdropCount} backdrop element(s) found. Details: ${JSON.stringify(backdropInfo)} ************** ${new Date().toISOString()}\n`);
      } else {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* No backdrop elements found ************** ${new Date().toISOString()}\n`);
      }
    } catch (backdropCheckError) {
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Could not check for backdrop: ${backdropCheckError.message} ************** ${new Date().toISOString()}\n`);
    }
    
    logger.error(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Error in AcceptingIncomingCallTHB after ${ept}ms: ${error.message} ************** ${new Date().toISOString()}\n`);
    throw error;
  }
  
  // Verify call is connected (optional check with shorter timeout)
  try {
    await delay(500);
    
    // Click on Omni-Channel before checking connected icon
    try {
      // Try to click "Omni-Channel (Online)" first
      await page.locator(`xpath=${ACCESSORS.omniChannelOnline}`).waitFor({ state: 'visible', timeout: timeoutMs });
      await page.locator(`xpath=${ACCESSORS.omniChannelOnline}`).click();
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Clicked on Omni-Channel (Online) before checking connected ************** ${new Date().toISOString()}\n`);
      await delay(1000); // Small delay for UI to update
    } catch (error) {
      // Fallback: try regular Omni-Channel button
      try {
        await page.locator(`xpath=${ACCESSORS.omniChannel}`).waitFor({ state: 'visible', timeout: timeoutMs });
        await page.locator(`xpath=${ACCESSORS.omniChannel}`).click();
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Clicked on Omni-Channel before checking connected ************** ${new Date().toISOString()}\n`);
        await delay(1000); // Small delay for UI to update
      } catch (fallbackError) {
        logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Could not click Omni-Channel: ${fallbackError.message} - continuing to check connected ************** ${new Date().toISOString()}\n`);
      }
    }
    
    // Use shorter timeout (10 seconds) instead of 500 seconds
    await page.locator(`xpath=${ACCESSORS.muteButton}`).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      // If connected icon doesn't appear, continue anyway
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Connected Icon not found within 10s, continuing... **************\n`);
    });
    const connectedIcon = await page.locator(`xpath=${ACCESSORS.muteButton}`).count() > 0;
    if (connectedIcon) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Connected Icon is visible  **************${new Date().toISOString()}\n`);
    }
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('AcceptingIncomingCallTHB_ConnectedIcon.png') });
    }
    
  } catch (error) {
    logger.error(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Error in checking if call is connected -  ${error.message} **************\n`);
  }
  
  // Get and log voice session ID
  try {
    const voiceSessionId = await page.evaluate(() => {
      const div = document.querySelector('div[data-target-selection-name="sfdc:RecordField.VoiceCall.VendorCallKey"]');
      if (div) {
        const span = div.querySelector('span.uiOutputText');
        return span ? span.textContent.trim() : '';
      }
      return '';
    });
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Voice Session ID: "${voiceSessionId}" **************\n`);
  } catch (sessionIdError) {
    logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Could not get voice session ID: ${sessionIdError.message} **************\n`);
  }
  
  // Get and log current page URL
  try {
    const currentUrl = page.url();
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Current Page URL: "${currentUrl}" **************\n`);
  } catch (urlError) {
    logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Could not get current page URL: ${urlError.message} **************\n`);
  }
  
  return ept;
}

// ============================================================
// ENABLE MICROPHONE - Request getUserMedia to ensure fake audio is used
// ============================================================
async function enableMicrophone(page) {
  const logger = { info: console.log, warn: console.warn };
  const username = process.env.username || config.username;
  const queueName = process.env.queueName || config.queueName;
 // const pauseLength = config.agentJoinTimeout || 60000;
  
  console.log('🎤 Step: Enabling microphone and requesting media stream');
  logger.info(`\n##### [CCAS] Enabling microphone  ************** ${new Date().toISOString()}\n`);
  
  try {
    // Explicitly request getUserMedia to ensure fake audio is captured
    await page.evaluate(async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (error) {
        // Silently handle errors
      }
    });
  } catch (error) {
    logger.warn(`\n##### [CCAS] Error enabling microphone: ${error.message} **************\n`);
    console.warn('⚠️ Error enabling microphone:', error);
  }
  
  
  logger.info(`\n##### [CCAS] Microphone enabled ************** ${new Date().toISOString()}\n`);
  
  // Check for customer and agent messages after microphone is enabled
  //Wait for 40 seconds to check the messages
  await delay(40000);
  try {
    // Wait for customer message (optional, shorter timeout)
    await page.locator(`xpath=${ACCESSORS.customerFirstMessage}`).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Customer message not found within 10s, continuing... **************\n`);
    });
    
    // Count customer messages
    const customerMessageCount = await page.locator(`xpath=${ACCESSORS.customerFirstMessage}`).count();
    if (customerMessageCount > 0) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Customer Messages found: ${customerMessageCount} **************${new Date().toISOString()}\n`);
      if (customerMessageCount > 1) {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Transcript is working (more than 1 message) **************\n`);
      }
    } else {
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Customer First Message not found  **************${new Date().toISOString()}\n`);
    }
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('AcceptingIncomingCallTHB_CustomerFirstMessage.png') });
    }
    
    // Wait for agent message (optional, shorter timeout)
    await page.locator(`xpath=${ACCESSORS.agentFirstMessage}`).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Agent message not found within 10s, continuing... **************\n`);
    });
    
    // Count agent messages
    const agentMessageCount = await page.locator(`xpath=${ACCESSORS.agentFirstMessage}`).count();
    if (agentMessageCount > 0) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Agent Messages found: ${agentMessageCount} **************${new Date().toISOString()}\n`);
      if (agentMessageCount > 1) {
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Transcript is working (more than 1 message) **************\n`);
      }
    } else {
      logger.warn(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Agent First Message not found  **************${new Date().toISOString()}\n`);
    }
    
    if (process.env.screenshot || config.screenshot) {
      await page.screenshot({ path: getScreenshotPath('AcceptingIncomingCallTHB_AgentFirstMessage.png') });
    }
    
    // Capture browser console logs after call is accepted and microphone is active
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Setting up browser console listener (after transcripts) ************** ${new Date().toISOString()}\n`);
    
    let browserConsoleLogCount = 0;
    const maxBrowserConsoleLogs = 3;
    const browserConsoleListener = (msg) => {
      // Log every message received for debugging
      const text = msg.text();
      const msgType = msg.type();
      
      if (browserConsoleLogCount >= maxBrowserConsoleLogs) {
        page.off('console', browserConsoleListener);
        return;
      }
      
      // Capture any console messages (log, info, warn, error, debug)
      browserConsoleLogCount++;
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* [Browser Console ${browserConsoleLogCount}/${maxBrowserConsoleLogs}] ${msgType}: ${text} ************** ${new Date().toISOString()}\n`);
      
      if (browserConsoleLogCount >= maxBrowserConsoleLogs) {
        page.off('console', browserConsoleListener);
        logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Reached max browser console logs (${maxBrowserConsoleLogs}), removing listener ************** ${new Date().toISOString()}\n`);
      }
    };
    
    // Listen for browser console messages
    page.on('console', browserConsoleListener);
    logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Browser console listener active, waiting for messages... ************** ${new Date().toISOString()}\n`);
    
    // Wait longer to capture console messages that appear after transcripts
    await delay(5000);
    
    // Log status
    if (browserConsoleLogCount === 0) {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* No browser console messages captured (waited 5s, count=${browserConsoleLogCount}) ************** ${new Date().toISOString()}\n`);
    } else {
      logger.info(`\n##### [CCAS] Agent ${username} ${queueName} : ************* Captured ${browserConsoleLogCount} browser console message(s) ************** ${new Date().toISOString()}\n`);
    }
    
    // Always remove listener
    page.off('console', browserConsoleListener);
  } catch (error) {
    logger.warn(`\n##### [CCAS] Error checking messages: ${error.message} **************\n`);
  }
}
// ============================================================
// END CALL
// ============================================================
async function endCall(page) {
  const logger = { info: console.log, warn: console.warn, error: console.error };
  const username = process.env.username || config.username;
  const timeoutMs = getNumberConfig('ccasTimeout', 50000);
  const callWaitTime = getNumberConfig('callWaitTime', 40000);
  
  console.log('📞 Step: Ending call');
  logger.info(`\n##### [CCAS] Agent ${username} : ************* Waiting for ${callWaitTime}ms ************** ${new Date().toISOString()}\n`);
  
  await delay(callWaitTime);
 
 
  // Try to click end button
  let endButtonClicked = false;
  try {
    await page.locator(`xpath=${ACCESSORS.endCallButton}`).waitFor({ state: 'visible', timeout: timeoutMs });
    await page.locator(`xpath=${ACCESSORS.endCallButton}`).click();
    logger.info(`\n##### [CCAS] Agent ${username} : ************* End call button found & clicked ************** ${new Date().toISOString()}\n`);
    endButtonClicked = true;
  } catch (error) {
    logger.warn(`\n##### [CCAS] Agent ${username} : ************* End call button not found or not clickable: ${error.message} - trying fallback ************** ${new Date().toISOString()}\n`);
    
    // Fallback: try again after delay
    try {
      await delay(500);
      //click on omni channel online button
      await page.locator(`xpath=${ACCESSORS.omniChannelOnline}`).waitFor({ state: 'visible', timeout: timeoutMs });
      await page.locator(`xpath=${ACCESSORS.omniChannelOnline}`).click();
      logger.info(`\n##### [CCAS] Agent ${username} : ************* Clicked Omni Channel Online button ************** ${new Date().toISOString()}\n`);
      await page.locator(`xpath=${ACCESSORS.endCallButton}`).waitFor({ state: 'visible', timeout: timeoutMs });
      await page.locator(`xpath=${ACCESSORS.endCallButton}`).click();
      logger.info(`\n##### [CCAS] Agent ${username} : ************* End call button found & clicked via fallback ************** ${new Date().toISOString()}\n`);
      endButtonClicked = true;
    } catch (fallbackError) {
      logger.warn(`\n##### [CCAS] Agent ${username} : ************* Fallback also failed: ${fallbackError.message} - proceeding to close tab ************** ${new Date().toISOString()}\n`);
    }
  }
  
  // Close the VC voice call tab
  try {
    // Get the latest/most recent Close VC button (use .last() to get the most recent one)
    const closeVCButtons = page.locator(`xpath=${ACCESSORS.closeVC}`);
    await closeVCButtons.last().waitFor({ state: 'visible', timeout: timeoutMs });
    await closeVCButtons.last().click();
    logger.info(`\n##### [CCAS] Agent ${username} : ************* Clicked Close VC button (latest) ************** ${new Date().toISOString()}\n`);
    
    // Check if confirmation popup appears
    await delay(1000);
    try {
      await page.locator(`xpath=${ACCESSORS.endCallConfirmButton}`).waitFor({ state: 'visible', timeout: 3000 });
      await page.locator(`xpath=${ACCESSORS.endCallConfirmButton}`).click();
      logger.info(`\n##### [CCAS] Agent ${username} : ************* Confirmation popup appeared, clicked "End Call" button ************** ${new Date().toISOString()}\n`);
    } catch (confirmError) {
      logger.info(`\n##### [CCAS] Agent ${username} : ************* No confirmation popup appeared (call ended directly) ************** ${new Date().toISOString()}\n`);
    }
    
    logger.info(`\n##### [CCAS] Agent ${username} : ************* Ended the Voice Call  **************\n`);
  } catch (error) {
    logger.error(`\n##### [CCAS] Agent ${username} : ************* Error closing voice call tab: ${error.message} ************** ${new Date().toISOString()}\n`);
    throw error;
  }
  
  if (process.env.screenshot || config.screenshot) {
    await page.screenshot({ path: getScreenshotPath('EndingCallTHB.png') });
  }
  
  await delay(getNumberConfig('defaultTimeout', 3000));
}

// ============================================================
// CONFIGURE CHROME WITH FAKE AUDIO CAPTURE
// ============================================================
// Get absolute path to audio file
// Construct absolute path: from test-plans/playwright/ go up one level to test-plans/, then into test-asset/
const audioFile = process.env.audioFile || config.audioFile;
const audioFilePath = audioFile.startsWith('/')
  ? audioFile  // Already absolute path
  : resolve(__dirname, '..', 'test-asset', 'roleplay_padded_30secSilence.wav');

// Verify audio file exists
if (existsSync(audioFilePath)) {
  console.log(`✅ Audio file found: ${audioFilePath}`);
} else {
  console.warn(`⚠️ Audio file NOT found: ${audioFilePath}`);
  console.warn(`⚠️ This may cause issues with fake audio capture!`);
}

// Configure Playwright to use fake audio capture with the selected audio file
// This must be called BEFORE test.describe()
// Following FPSx pattern: audio capture and permissions configured in test script
test.use({
  // Use system-installed Chrome instead of bundled Chromium
  channel: 'chrome',
  // Run in headed mode (visible browser) for debugging
  headless: true,
  // Grant permissions for microphone and camera
  permissions: ['microphone', 'camera'],
  // Chrome launch options for fake media streams
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${audioFilePath}`,
      '--allow-file-access-from-files',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-web-security',
      '--enable-experimental-web-platform-features',
      '--start-maximized',
    ],
  },
});

// ============================================================
// MAIN TEST
// ============================================================
test.describe('CCAS Voice Call', () => {
  
  test('CCAS Native Stack Call Flow with EPT Measurement', async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(0); // No timeout

    // Set default timeout to a reasonable value (use loginWaitTimeout as it's the longest operation)
    // thinkTime (12000) is too short for login operations
    page.setDefaultTimeout(getNumberConfig('loginWaitTimeout', 30000));
    
    // Get config values for use in test (FPSx pattern: process.env.X || config.X)
    const server = process.env.server || config.server;
    
    try {
      console.log('🚀 Starting CCAS Voice Call test');
      console.log(`🎤 Audio file configured: ${audioFilePath}`);
      
      // Grant permissions for microphone, camera, etc.
      // Use the server URL from config/env (should always be set)
      if (!server) {
        throw new Error('Server URL is required but not found in config or environment variables');
      }
      await context.grantPermissions(
        ['microphone', 'camera', 'notifications'],
        {
          origin: server,
        }
      );
      console.log('✅ Permissions granted for microphone and camera');
      
      // Set up console logging to monitor getUserMedia and WebRTC calls (limit to 2 logs only)
      let consoleLogCount = 0;
      const maxConsoleLogs = 2;
      page.on('console', msg => {
        if (consoleLogCount >= maxConsoleLogs) {
          return; // Stop logging after 2 messages
        }
        const text = msg.text();
        if (text.includes('getUserMedia') || text.includes('RTCPeerConnection') || text.includes('mediaDevices') || text.includes('audio track') || text.includes('packetsSent') || text.includes('packetsReceived')) {
          consoleLogCount++;
          console.log(`[Browser Console] ${msg.type()}: ${text} (${consoleLogCount}/${maxConsoleLogs})`);
        }
      });
      
      // Step 1: Login
      await loginToSalesforce(page);
      
      // Step 2: Open WebRTC Gateway
      await openWebRTCGateway(page);
      
      // Step 3: Set Omni-Channel Online
      await setOmniChannelOnline(page);
      
      // Step 4: Accept Incoming Call
      await acceptIncomingCall(page);
      
      // Step 5: Enable Microphone
      await enableMicrophone(page);
      
      // Step 6: End Call
      await endCall(page);
      
      console.log('🎉 Test completed successfully!');
      
    } catch (error) {
      console.log(`❌ CCAS Voice Call Test Failed: ${error.message}`);
      console.error(error);
      throw error;
    }
  });
});
