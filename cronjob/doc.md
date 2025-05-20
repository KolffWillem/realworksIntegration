/\*\*

  ## Cronjob Documentation

  ### Overview
  This cronjob is designed to synchronize data from Realworks by calling the `syncRealwork` function.
  The entry point for the cronjob is `cronjob/index.js`, and it is managed as a PM2 instance.

  ### Sync Flow
  The synchronization process follows these steps:

  1.  **Call `syncRealwork` Function**:
  The cronjob initiates the synchronization process by invoking the `syncRealwork` function.

  2.  **Fetch Integration Instances**:
  Retrieve integration instances that are due for synchronization based on the `next_sync_at` timestamp.

  3.  **Process Each Integration Instance**:
  **Fetch and Sync Status and Types**:
        Retrieve and synchronize all statuses and types from Realworks.
  **Fetch Agendas**:
        Retrieve all agenda data.
  **Separate Blocks and Appointments**:
        Distinguish between blocks and appointments in the agenda data.
  **Process Blocks**:
        Identify new blocks and blocks that require updates by analyzing external attributes.
        Process new blocks and update existing blocks as needed.
  **Process Appointments**:
        Follow a similar flow as blocks to process new and updated appointments.

  ### Sync Flow Diagram
  ```plaintext
  cronjob/index.js
    |
    v
  syncRealwork()
    |
    v
  Fetch Integration Instances (next_sync_at)
    |
    v
  For Each Integration Instance:
    |
    +--> Fetch and Sync Status and Types
    |
    +--> Fetch Agendas
      |
      v
    Separate Blocks and Appointments
      |
      +--> Process Blocks
      |       +--> Identify New and Updated Blocks
      |       +--> Process New Blocks
      |       +--> Update Existing Blocks
      |
      +--> Process Appointments
         +--> Identify New and Updated Appointments
         +--> Process New Appointments
         +--> Update Existing Appointments
  ```

  ### Potential Approach to Scale Up
  To improve scalability, the following approach can be adopted:

  1.  **Decouple Fetching and Processing**:
  Move the fetching of integration instances from `cronjob/sync-realworks-data.js` to `cronjob/index.js`.

  2.  **Introduce a Queue**:
  Add each integration instance to a message queue (e.g., Kafka) or a job queue (e.g., Bull Queue).

  3.  **Refactor as Worker**:
  Refactor `cronjob/sync-realworks-data.js` to act as a worker that consumes jobs from the queue.

  4.  **Deploy with PM2**:
  Deploy `cronjob/index.js` as the producer.
  Deploy multiple instances of `cronjob/sync-realworks-data.js` as workers using PM2.
  
  ### PM2 Configuration File
  Below is an example PM2 configuration file to simplify the deployment process:

  ```json

  {
  "apps": [
      {
        "name": "cronjob-producer",
        "script": "cronjob/index.js",
        "instances": 1,
        "exec_mode": "fork"
      },
      {
        "name": "cronjob-worker",
        "script": "cronjob/sync-realworks-data.js",
        "instances": 4,
        "exec_mode": "cluster"
      }
    ]
  }

  ```

  `cronjob-producer`: Handles fetching integration instances and adding them to the queue.
  `cronjob-worker`: Processes jobs from the queue. Multiple instances can be deployed for scalability.

  ### Running the PM2 Configuration
  To start the PM2 processes using the configuration file, run the following command:

  ```bash

  pm2 start pm2.config.json
  */
  ```
