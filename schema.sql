CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  account_type ENUM('customer', 'provider') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  UNIQUE KEY users_phone_unique (phone)
);

CREATE TABLE IF NOT EXISTS providers (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  service_type VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY providers_user_id_unique (user_id),
  CONSTRAINT providers_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  provider_id INT NOT NULL,
  problem TEXT NULL,
  status ENUM('Pending', 'Accepted', 'Rejected', 'Completed')
    NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY bookings_customer_created_idx (customer_id, created_at),
  KEY bookings_provider_created_idx (provider_id, created_at),
  CONSTRAINT bookings_customer_id_fk
    FOREIGN KEY (customer_id) REFERENCES users (id),
  CONSTRAINT bookings_provider_id_fk
    FOREIGN KEY (provider_id) REFERENCES providers (id)
);
