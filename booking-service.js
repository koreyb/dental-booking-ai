#!/usr/bin/env node

/**
 * Dental Booking AI Service - Hybrid SMS Approach
 * 
 * Flow: Retell AI collects info → Send SMS with booking link → Patient books themselves
 * This avoids API dependency on MaxAssist and works with any booking platform.
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio Configuration (set via environment variables)
// Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// Optional: TWILIO_PHONE_NUMBER (default: +14809064274)
const TWILIO = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+14809064274',
};

// Booking link - AppointNow platform
const BOOKING_LINK = process.env.BOOKING_LINK || 'https://www.appointnow.com/?P=5391&O=107&PT=0&culture=en-US';

app.use(cors());
app.use(express.json());

/**
 * Send SMS with booking link
 * @param {string} phone - Phone number
 * @param {string} patientName - Patient name
 * @param {string} appointmentType - Type of appointment
 * @param {string} confirmedTime - Optional confirmed time slot
 */
async function sendBookingSMS(phone, patientName, appointmentType, confirmedTime) {
  let message;
  if (confirmedTime) {
    message = `Hi ${patientName}! Confirm your dental appointment for ${confirmedTime}. Complete your details here: ${BOOKING_LINK}`;
  } else {
    message = `Hi ${patientName}! Thanks for calling Smile Dental Studio. ` +
      `Book your ${appointmentType || 'appointment'} here: ${BOOKING_LINK} ` +
      `- or call us back at (480) 906-4274. See you soon!`;
  }
  
  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO.accountSid}/Messages.json`,
      new URLSearchParams({
        To: phone,
        From: TWILIO.phoneNumber,
        Body: message,
      }),
      {
        auth: {
          username: TWILIO.accountSid,
          password: TWILIO.authToken,
        },
      }
    );
    
    return {
      success: true,
      sid: response.data.sid,
      message: 'SMS sent successfully',
    };
  } catch (error) {
    console.error('SMS error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Format phone for Twilio
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }
  if (digits.length === 10) {
    return '+1' + digits;
  }
  if (!phone.startsWith('+')) {
    return '+' + digits;
  }
  return phone;
}

// ===================
// API Endpoints
// ===================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'sms-hybrid',
    timestamp: new Date().toISOString() 
  });
});

/**
 * Send booking link via SMS
 * POST /send-booking-link
 * Body: {
 *   patientName: "John",
 *   phone: "4805551234",
 *   appointmentType: "emergency-exam"
 * }
 */
app.post('/send-booking-link', async (req, res) => {
  try {
    const { patientName, phone, appointmentType, confirmedTime } = req.body;
    
    if (!patientName || !phone) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['patientName', 'phone'],
      });
    }
    
    const normalizedPhone = normalizePhone(phone);
    
    // Custom message if they already picked a time
    let message;
    if (confirmedTime) {
      message = `Hi ${patientName}! Confirm your dental appointment for ${confirmedTime}. ` +
        `Complete your details here: ${BOOKING_LINK}`;
    } else {
      message = `Hi ${patientName}! Thanks for calling Smile Dental Studio. ` +
        `Book your ${appointmentType || 'appointment'} here: ${BOOKING_LINK} ` +
        `- or call us back at (480) 906-4274. See you soon!`;
    }
    
    console.log(`Sending booking SMS to ${normalizedPhone} for ${patientName}`);
    
    const result = await sendBookingSMS(normalizedPhone, patientName, appointmentType, confirmedTime);
    
    res.json({
      success: result.success,
      message: result.message || result.error,
      patient: {
        name: patientName,
        phone: normalizedPhone,
        appointmentType: appointmentType || 'dental appointment',
      },
      ...(result.sid && { sid: result.sid }),
    });
  } catch (error) {
    console.error('Booking link error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check availability (optional - for future use)
 * POST /check-availability
 */
app.post('/check-availability', async (req, res) => {
  const { date, appointmentType } = req.body;
  
  // Return realistic time slots - in production, scrape AppointNow for real availability
  const timeSlots = [
    { time: '09:00 AM', available: true },
    { time: '09:30 AM', available: true },
    { time: '10:00 AM', available: true },
    { time: '10:30 AM', available: false },
    { time: '11:00 AM', available: true },
    { time: '11:30 AM', available: true },
    { time: '01:00 PM', available: true },
    { time: '01:30 PM', available: true },
    { time: '02:00 PM', available: false },
    { time: '02:30 PM', available: true },
    { time: '03:00 PM', available: true },
    { time: '03:30 PM', available: true },
    { time: '04:00 PM', available: true },
    { time: '04:30 PM', available: false },
  ];
  
  res.json({
    date: date || new Date().toISOString().split('T')[0],
    appointmentType: appointmentType || 'emergency-exam',
    slots: timeSlots.filter(s => s.available).map(s => s.time),
  });
});

/**
 * Handle Retell webhook - process collected patient info
 * POST /retell-webhook
 * 
 * Accepts all patient fields:
 * - first_name, last_name (or patient_name)
 * - phone (required)
 * - email
 * - date_of_birth
 * - appointment_type
 * - insurance_name, insurance_subscriber_name, insurance_subscriber_id, insurance_group_number
 * - preferred_date, preferred_time
 * - provider_preference
 */
app.post('/retell-webhook', async (req, res) => {
  try {
    const { 
      patient_name, 
      first_name,
      last_name,
      phone, 
      email,
      date_of_birth,
      appointment_type,
      insurance_name,
      insurance_subscriber_name,
      insurance_subscriber_id,
      insurance_group_number,
      preferred_date,
      preferred_time,
      provider_preference,
      confirmed_time,
    } = req.body;
    
    const name = patient_name || `${first_name || ''} ${last_name || ''}`.trim() || 'Patient';
    const phoneNumber = phone;
    const aptType = appointment_type || 'dental appointment';
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    const normalizedPhone = normalizePhone(phoneNumber);
    
    // Log all collected info for records
    const patientInfo = {
      name,
      phone: normalizedPhone,
      email,
      date_of_birth,
      appointment_type: aptType,
      insurance: insurance_name ? {
        name: insurance_name,
        subscriber_name: insurance_subscriber_name,
        subscriber_id: insurance_subscriber_id,
        group_number: insurance_group_number,
      } : null,
      preferred_date,
      preferred_time,
      provider_preference,
    };
    
    console.log('Patient info collected:', JSON.stringify(patientInfo));
    
    // Send SMS with booking link
    const result = await sendBookingSMS(normalizedPhone, name, aptType, confirmed_time);
    
    res.json({
      action: 'sms_sent',
      success: result.success,
      message: result.success 
        ? `Booking link sent to ${normalizedPhone}`
        : `Failed to send SMS: ${result.error}`,
      patient: patientInfo,
    });
  } catch (error) {
    console.error('Retell webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Format phone for display
 * POST /format-phone
 */
app.post('/format-phone', (req, res) => {
  const { phone } = req.body;
  const normalized = normalizePhone(phone);
  let formatted = normalized;
  if (normalized.length === 12) {
    formatted = `(${normalized.slice(2,5)}) ${normalized.slice(5,8)}-${normalized.slice(8)}`;
  }
  res.json({ formatted, normalized });
});

// Start server
app.listen(PORT, () => {
  console.log(`🦷 Dental Booking AI running on port ${PORT}`);
  console.log(`   Mode: SMS Hybrid (booking link via SMS)`);
  console.log(`   Booking Link: ${BOOKING_LINK}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Send booking link: POST /send-booking-link`);
  console.log(`   Retell webhook: POST /retell-webhook`);
});

module.exports = app;
