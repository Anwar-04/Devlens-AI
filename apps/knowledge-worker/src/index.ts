const workerName = "knowledge-worker";

const startupMessage = {
  service: workerName,
  status: "ready",
  queues: ["knowledge.summarize", "knowledge.embed", "knowledge.graph"]
};

console.log(JSON.stringify(startupMessage));

