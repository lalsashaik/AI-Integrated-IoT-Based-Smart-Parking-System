import cv2
import easyocr
import threading
import firebase_admin
from firebase_admin import credentials, db
import time

# Firebase Setup
cred = credentials.Certificate("firebase_key.json")

firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://lalsatechworks-default-rtdb.firebaseio.com'
})

reader = easyocr.Reader(['en'])

url = "http://10.173.23.132:81/stream"
cap = cv2.VideoCapture(url)

latest_frame = None
detected_text = ""
last_processed = ""
lock = threading.Lock()

# Firebase Update Function
def update_firebase(vehicle_number):
    global last_processed

    if vehicle_number == last_processed:
        return

    from datetime import datetime, timezone
    import math

    bookings_ref = db.reference("bookings")
    all_bookings = bookings_ref.get()

    if all_bookings is None:
        print("No bookings found")
        return

    found = False
    current_time = datetime.now(timezone.utc).isoformat()

    for booking_id, data in all_bookings.items():

        db_vehicle = str(data.get("vehicle", "")).replace(" ", "").upper()

        if db_vehicle == vehicle_number:
            found = True
            booking_ref = db.reference(f"bookings/{booking_id}")

            status = data.get("status")

            # ENTRY
            if status == "Reserved":
                booking_ref.update({
                    "entryTime": current_time,
                    "status": "Parked"
                })
                print(f"{vehicle_number} ENTERED")

    last_processed = vehicle_number

    if not found:
        print("Vehicle not found in bookings")


# OCR THREAD
def ocr_worker():
    global latest_frame, detected_text

    while True:
        if latest_frame is None:
            continue

        frame_copy = latest_frame.copy()
        gray = cv2.cvtColor(frame_copy, cv2.COLOR_BGR2GRAY)

        results = reader.readtext(gray)

        for (_, text, prob) in results:
            if prob > 0.5:
                clean_text = text.strip().replace(" ", "").upper()

                with lock:
                    detected_text = clean_text

                print("Detected:", clean_text)

                # Update Firebase
                update_firebase(clean_text)

# Start thread
threading.Thread(target=ocr_worker, daemon=True).start()

while True:
    ret, frame = cap.read()

    if not ret:
        continue

    frame = cv2.resize(frame, (320, 240))
    latest_frame = frame

    with lock:
        text_to_show = detected_text

    cv2.putText(frame, text_to_show, (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    cv2.imshow("SMART PARKING SYSTEM", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()