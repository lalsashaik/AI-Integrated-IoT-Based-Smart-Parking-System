#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// OLED Config
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// WIFI & SERVER
#define WIFI_SSID "94E5-078-7841-55E"
#define WIFI_PASSWORD "Shaik1234"
#define SERVER_URL "http://10.226.39.124:5000/status"

// SERVOS & PINS
Servo entryGate, exitGate, slot1, slot2, slot3;
#define ENTRY_PIN 13
#define EXIT_PIN 12
#define SLOT1_PIN 14
#define SLOT2_PIN 27
#define SLOT3_PIN 26
#define BUZZER_PIN 25

// STATE TRACKING
String ids[20];
String lastStatus[20];
int count = 0;

// NON-BLOCKING TIMER VARIABLES
unsigned long lastFetchTime = 0;
const long fetchInterval = 500; // Fetch every 0.5 seconds for "Real-time" feel

// HELPER: Perfect Text Centering
void centerText(String text, int y, int size) {
  int16_t x1, y1;
  uint16_t w, h;
  display.setTextSize(size);
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((SCREEN_WIDTH - w) / 2, y);
  display.print(text);
}

void showWelcome() {
  display.clearDisplay();
  display.setTextColor(WHITE);
  centerText("Welcome to", 15, 1);
  centerText("Park & Go", 35, 2); // Size 1 fits perfectly on one line
  display.display();
}

void setup() {
  Serial.begin(115200);
  
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) Serial.println("OLED Fail");
  display.clearDisplay();
  centerText("BOOTING...", 25, 1);
  display.display();

  pinMode(BUZZER_PIN, OUTPUT);
  entryGate.attach(ENTRY_PIN);
  exitGate.attach(EXIT_PIN);
  slot1.attach(SLOT1_PIN);
  slot2.attach(SLOT2_PIN);
  slot3.attach(SLOT3_PIN);

  // Initialize gates to closed
  entryGate.write(0); exitGate.write(0);
  slot1.write(0); slot2.write(0); slot3.write(0);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(200); Serial.print("."); }
  
  showWelcome();
}

void loop() {
  unsigned long currentMillis = millis();

  // Check server every 500ms without using delay()
  if (currentMillis - lastFetchTime >= fetchInterval) {
    lastFetchTime = currentMillis;
    fetchData();
  }
}

void fetchData() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, payload);

    for (JsonObject obj : doc.as<JsonArray>()) {
      String id = obj["id"];
      String status = obj["status"];
      String slot = obj["slot"];

      int index = getIndex(id);

      if (index == -1) {
        ids[count] = id;
        lastStatus[count] = status;
        count++;
        continue;
      }

      // Detect Status Change
      if (status != lastStatus[index]) {
        
        // CASE: ENTRY (Reserved -> Parked)
        if (lastStatus[index] == "Reserved" && status == "Parked") {
          handleEntry(slot);
        }
        
        // CASE: EXIT (Parked -> Exit)
        else if (lastStatus[index] == "Parked" && status == "Exit") {
          handleExit(slot);
        }

        lastStatus[index] = status;
      }
    }
  }
  http.end();
}

void handleEntry(String slotID) {
  buzzer();
  entryGate.write(60); // Open Entry
  openSlotGate(slotID); // Open Slot

  // Countdown Loop - Overrides Welcome Screen
  for (int i = 5; i > 0; i--) {
    display.clearDisplay();
    display.drawFastHLine(0, 10, 128, WHITE);
    
    centerText(slotID, 20, 1); // e.g., "NITBG-01"
    centerText("Gate closed in", 35, 1);
    centerText(String(i), 50, 2); // Big number for countdown
    
    display.display();
    delay(1000); // Countdown must be 1 sec intervals
  }

  entryGate.write(0); // Close Entry
  showWelcome(); // Return to original welcome message
}

void handleExit(String slotID) {
  closeSlotGate(slotID);
  buzzer();
  exitGate.write(60);
  delay(5000);
  exitGate.write(0);
  // No OLED changes here as requested - remains on Welcome screen
}

int getIndex(String id) {
  for (int i = 0; i < count; i++) {
    if (ids[i] == id) return i;
  }
  return -1;
}

void openSlotGate(String slot) {
  if (slot == "NITBG-01") slot1.write(60);
  else if (slot == "NITBG-02") slot2.write(60);
  else if (slot == "NITBG-03") slot3.write(60);
}

void closeSlotGate(String slot) {
  if (slot == "NITBG-01") slot1.write(0);
  else if (slot == "NITBG-02") slot2.write(0);
  else if (slot == "NITBG-03") slot3.write(0);
}

void buzzer() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
}