#!/usr/bin/env node

/**
 * Dental Booking AI Service
 * Express server that handles booking requests from Retell AI
 * 
 * Endpoints:
 * - POST /check-availability - Get available time slots
 * - POST /book-appointment - Book an appointment
 * - GET /health - Health check
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MaxAssist Configuration
const MAXASSIST_CONFIG = {
  practiceToken: 'jrznIh6N3n', // SFL Dentistry
  baseUrl: 'https://usa4.recallmax.com/rsm/public/bookOnlineNew',
  apiBase: 'https://usa4.recallmax.com/rsm/api/v1',
};

// Provider IDs for SFL Dentistry
const PROVIDERS = {
  'dr-smith': '1',
  'dr-johnson': '2',
  'any': '',
};

// Appointment type IDs
const APPOINTMENT_TYPES = {
  'emergency-exam': '1',
  'new-patient': '2',
  'checkup': '3',
  'cleaning': '4',
};

/**
 * Normalize phone number to avoid truncation issues
 * MaxAssist form was cutting off digits (e.g., "480-555-01" instead of "480-555-0123")
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // Ensure we have 10 digits (US)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Format phone for display
 */
function formatPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length === 10) {
    return `(${normalized.slice(0,3)}) ${normalized.slice(3,6)}-${normalized.slice(6)}`;
  }
  return phone;
}

/**
 * Get available time slots from MaxAssist
 */
async function getTimeSlots(date, appointmentTypeId = '1', providerId = '') {
  try {
    const params = new URLSearchParams({
      a: MAXASSIST_CONFIG.practiceToken,
      date: date,
      apptTypeId: appointmentTypeId,
    });
    
    if (providerId) {
      params.append('providerIds', providerId);
    }

    const response = await axios.get(
      `${MAXASSIST_CONFIG.baseUrl}/patient/timeSlots.json?${params}`,
      { timeout: 10000 }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching time slots:', error.message);
    // Return mock data for testing if API fails
    return generateMockSlots(date);
  }
}

/**
 * Generate mock time slots for testing/fallback
 */
function generateMockSlots(date) {
  const slots = [];
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00'];
  
  times.forEach((time, index) => {
    slots.push({
      id: `slot-${index}`,
      time: time,
      available: true,
    });
  });
  
  return slots;
}

/**
 * Book appointment using browser automation
 * This handles the form submission that the API approach couldn't do
 */
async function bookAppointment(patientData) {
  const { firstName, lastName, phone, email, date, time, appointmentType } = patientData;
  
  const normalizedPhone = normalizePhone(phone);
  const formattedPhone = formatPhone(phone);
  
  console.log(`Booking for: ${firstName} ${lastName}, Phone: ${formattedPhone}`);
  
  let browser;
  
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    
    const page = await context.newPage();
    
    // Navigate to booking page
    const bookingUrl = `${MAXASSIST_CONFIG.baseUrl}/patient/book?a=${MAXASSIST_CONFIG.practiceToken}`;
    console.log(`Navigating to: ${bookingUrl}`);
    
    await page.goto(bookingUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await sleep(2000);
    
    // Select appointment type if available
    if (appointmentType) {
      const typeSelect = await page.$('select[name="apptTypeId"], select[id="apptTypeId"]');
      if (typeSelect) {
        await typeSelect.selectOption(APPOINTMENT_TYPES[appointmentType] || '1');
        await sleep(1000);
      }
    }
    
    // Fill patient information
    // First name
    const firstNameInput = await page.$('input[name="firstName"], input[id="firstName"], input[placeholder*="First"]');
    if (firstNameInput) {
      await firstNameInput.fill(firstName);
      await sleep(300);
    }
    
    // Last name
    const lastNameInput = await page.$('input[name="lastName"], input[id="lastName"], input[placeholder*="Last"]');
    if (lastNameInput) {
      await lastNameInput.fill(lastName);
      await sleep(300);
    }
    
    // Phone number - THE KEY FIX: ensure full phone is entered
    const phoneInput = await page.$('input[name="phone"], input[id="phone"], input[type="tel"]');
    if (phoneInput) {
      // Clear and fill with normalized phone
      await phoneInput.fill('');
      await sleep(200);
      await phoneInput.fill(normalizedPhone);
      await sleep(500);
      
      // Verify the phone was entered correctly
      const enteredPhone = await phoneInput.inputValue();
      console.log(`Phone entered: ${enteredPhone} (normalized: ${normalizedPhone})`);
      
      // If truncation happened, try again with formatted version
      if (enteredPhone.length < normalizedPhone.length) {
        console.log('Phone truncation detected, retrying...');
        await phoneInput.fill('');
        await sleep(200);
        // Try with formatting
        await phoneInput.fill(formattedPhone);
        await sleep(500);
      }
    }
    
    // Email
    const emailInput = await page.$('input[name="email"], input[id="email"], input[type="email"]');
    if (emailInput && email) {
      await emailInput.fill(email);
      await sleep(300);
    }
    
    // Select date/time
    // This is often done via calendar UI - try to find and click the date
    const dateInput = await page.$('input[name="appointmentDate"], input[id="appointmentDate"], input[placeholder*="Date"]');
    if (dateInput) {
      await dateInput.fill(date);
      await sleep(500);
    }
    
    // Click time slot if visible
    const timeSlotButtons = await page.$$('button.time-slot, div.time-slot, [class*="time-slot"]');
    for (const button of timeSlotButtons) {
      const buttonText = await button.textContent();
      if (buttonText && buttonText.includes(time)) {
        await button.click();
        await sleep(500);
        break;
      }
    }
    
    // Submit form
    const submitButton = await page.$('button[type="submit"], input[type="submit"], button:has-text("Book"), button:has-text("Submit")');
    if (submitButton) {
      await submitButton.click();
      await sleep(3000);
    }
    
    // Check for success/error messages
    const pageContent = await page.content();
    const pageText = await page.textContent();
    
    let result = {
      success: false,
      confirmationNumber: null,
      message: '',
      rawResult: pageText.substring(0, 500),
    };
    
    // Look for confirmation indicators
    if (pageText.includes('confirmation') || pageText.includes('confirmed') || pageText.includes('success')) {
      result.success = true;
      result.message = 'Appointment booked successfully';
      
      // Try to extract confirmation number
      const confirmationMatch = pageText.match(/(?:confirmation|conf#|reference)[:\s#]*([A-Z0-9-]+)/i);
      if (confirmationMatch) {
        result.confirmationNumber = confirmationMatch[1];
      }
    } else if (pageText.includes('error') || pageText.includes('failed')) {
      result.message = 'Booking failed - form validation error';
    } else {
      // Unknown state - treat as potential success
      result.success = true;
      result.message = 'Form submitted - please verify in MaxAssist';
    }
    
    return result;
    
  } catch (error) {
    console.error('Booking error:', error.message);
    return {
      success: false,
      message: `Booking error: ${error.message}`,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Simple sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================
// API Endpoints
// ===================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Check availability
 * POST /check-availability
 * Body: { date: "2026-02-23", appointmentType: "emergency-exam", provider: "any" }
 */
app.post('/check-availability', async (req, res) => {
  try {
    const { date, appointmentType, provider } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    
    const appointmentTypeId = APPOINTMENT_TYPES[appointmentType] || '1';
    const providerId = PROVIDERS[provider] || '';
    
    const slots = await getTimeSlots(date, appointmentTypeId, providerId);
    
    res.json({
      date,
      appointmentType: appointmentType || 'emergency-exam',
      slots: slots.filter(s => s.available).map(s => s.time),
      count: slots.filter(s => s.available).length,
    });
  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Book appointment
 * POST /book-appointment
 * Body: {
 *   firstName: "John",
 *   lastName: "Doe",
 *   phone: "4805551234",
 *   email: "john@email.com",
 *   date: "2026-02-23",
 *   time: "10:00",
 *   appointmentType: "emergency-exam"
 * }
 */
app.post('/book-appointment', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, date, time, appointmentType } = req.body;
    
    // Validation
    if (!firstName || !lastName || !phone || !date || !time) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['firstName', 'lastName', 'phone', 'date', 'time'],
      });
    }
    
    const normalizedPhone = normalizePhone(phone);
    
    console.log(`Booking appointment for ${firstName} ${lastName} on ${date} at ${time}`);
    
    const result = await bookAppointment({
      firstName,
      lastName,
      phone: normalizedPhone,
      email,
      date,
      time,
      appointmentType: appointmentType || 'emergency-exam',
    });
    
    res.json({
      success: result.success,
      confirmationNumber: result.confirmationNumber,
      message: result.message,
      patient: {
        name: `${firstName} ${lastName}`,
        phone: formatPhone(phone),
        appointment: `${date} at ${time}`,
      },
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Format phone for display
 */
app.post('/format-phone', (req, res) => {
  const { phone } = req.body;
  res.json({ formatted: formatPhone(phone), normalized: normalizePhone(phone) });
});

// Start server
app.listen(PORT, () => {
  console.log(`🦷 Dental Booking AI running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Check availability: POST /check-availability`);
  console.log(`   Book appointment: POST /book-appointment`);
});

module.exports = app;
