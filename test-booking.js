#!/usr/bin/env node

/**
 * Test script for dental booking service
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testHealth() {
  console.log('\n🧪 Testing health endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return false;
  }
}

async function testAvailability() {
  console.log('\n🧪 Testing availability check...');
  try {
    const response = await axios.post(`${BASE_URL}/check-availability`, {
      date: '2026-02-23',
      appointmentType: 'emergency-exam',
      provider: 'any',
    });
    console.log('✅ Availability:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Availability check failed:', error.message);
    return null;
  }
}

async function testBooking() {
  console.log('\n🧪 Testing booking (test patient)...');
  try {
    const response = await axios.post(`${BASE_URL}/book-appointment`, {
      firstName: 'Test',
      lastName: 'Patient',
      phone: '4805551234',
      email: 'test@example.com',
      date: '2026-02-24',
      time: '10:00',
      appointmentType: 'emergency-exam',
    });
    console.log('✅ Booking result:', response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Booking failed:', error.message);
    return null;
  }
}

async function testPhoneFormatting() {
  console.log('\n🧪 Testing phone formatting...');
  const testPhones = [
    '480-555-1234',
    '4805551234',
    '1-480-555-1234',
    '(480) 555-1234',
    '555-01-23', // truncated case
  ];
  
  try {
    for (const phone of testPhones) {
      const response = await axios.post(`${BASE_URL}/format-phone`, { phone });
      console.log(`  ${phone} → ${response.data.formatted} (normalized: ${response.data.normalized})`);
    }
    return true;
  } catch (error) {
    console.log('❌ Phone formatting test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🦷 Dental Booking AI - Test Suite');
  console.log('==================================');
  
  // Test health
  const healthOk = await testHealth();
  if (!healthOk) {
    console.log('\n❌ Server not running. Start with: npm start');
    process.exit(1);
  }
  
  // Test phone formatting
  await testPhoneFormatting();
  
  // Test availability
  await testAvailability();
  
  // Test booking (optional - only run if explicitly requested)
  if (process.env.RUN_BOOKING_TEST === 'true') {
    await testBooking();
  } else {
    console.log('\n⏭️  Skipping booking test (set RUN_BOOKING_TEST=true to run)');
  }
  
  console.log('\n✅ Tests complete!');
}

runTests();
