//! Enterprise Resilience Patterns
//! 
//! Provides:
//! - Circuit breaker
//! - Retry with exponential backoff
//! - Rate limiting
//! - Timeout management
//! - Bulkhead isolation

use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::RwLock;
use governor::{Quota, RateLimiter, clock::DefaultClock, state::{InMemoryState, NotKeyed}};
use tokio::time::timeout;

// ============================================================
// Circuit Breaker
// ============================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,   // Normal operation
    Open,     // Failing, reject requests
    HalfOpen, // Testing if service recovered
}

pub struct CircuitBreaker {
    state: Arc<RwLock<CircuitState>>,
    failure_threshold: usize,
    success_threshold: usize,
    timeout_duration: Duration,
    failure_count: Arc<RwLock<usize>>,
    success_count: Arc<RwLock<usize>>,
    last_failure_time: Arc<RwLock<Option<Instant>>>,
}

impl CircuitBreaker {
    pub fn new(
        failure_threshold: usize,
        success_threshold: usize,
        timeout_duration: Duration,
    ) -> Self {
        Self {
            state: Arc::new(RwLock::new(CircuitState::Closed)),
            failure_threshold,
            success_threshold,
            timeout_duration,
            failure_count: Arc::new(RwLock::new(0)),
            success_count: Arc::new(RwLock::new(0)),
            last_failure_time: Arc::new(RwLock::new(None)),
        }
    }
    
    pub fn is_open(&self) -> bool {
        let state = *self.state.read();
        
        if state == CircuitState::Open {
            // Check if timeout has passed to move to HalfOpen
            if let Some(last_failure) = *self.last_failure_time.read() {
                if last_failure.elapsed() > self.timeout_duration {
                    *self.state.write() = CircuitState::HalfOpen;
                    *self.success_count.write() = 0;
                    return false;
                }
            }
            return true;
        }
        
        false
    }
    
    pub fn record_success(&self) {
        let state = *self.state.read();
        
        match state {
            CircuitState::HalfOpen => {
                let mut success_count = self.success_count.write();
                *success_count += 1;
                
                if *success_count >= self.success_threshold {
                    *self.state.write() = CircuitState::Closed;
                    *self.failure_count.write() = 0;
                    *self.success_count.write() = 0;
                }
            }
            CircuitState::Closed => {
                *self.failure_count.write() = 0;
            }
            _ => {}
        }
    }
    
    pub fn record_failure(&self) {
        let state = *self.state.read();
        
        match state {
            CircuitState::Closed | CircuitState::HalfOpen => {
                let mut failure_count = self.failure_count.write();
                *failure_count += 1;
                
                if *failure_count >= self.failure_threshold {
                    *self.state.write() = CircuitState::Open;
                    *self.last_failure_time.write() = Some(Instant::now());
                }
            }
            _ => {}
        }
    }
    
    pub fn state(&self) -> CircuitState {
        *self.state.read()
    }
}

// ============================================================
// Retry with Exponential Backoff
// ============================================================

pub struct RetryPolicy {
    max_attempts: usize,
    initial_delay: Duration,
    max_delay: Duration,
    multiplier: f64,
}

impl RetryPolicy {
    pub fn new(
        max_attempts: usize,
        initial_delay: Duration,
        max_delay: Duration,
        multiplier: f64,
    ) -> Self {
        Self {
            max_attempts,
            initial_delay,
            max_delay,
            multiplier,
        }
    }
    
    pub fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
        }
    }
    
    pub async fn execute<F, Fut, T, E>(&self, mut f: F) -> Result<T, E>
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = Result<T, E>>,
    {
        let mut attempt = 0;
        let mut delay = self.initial_delay;
        
        loop {
            attempt += 1;
            
            match f().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if attempt >= self.max_attempts {
                        return Err(e);
                    }
                    
                    tokio::time::sleep(delay).await;
                    
                    delay = Duration::from_millis(
                        (delay.as_millis() as f64 * self.multiplier) as u64
                    ).min(self.max_delay);
                }
            }
        }
    }
}

// ============================================================
// Rate Limiter
// ============================================================

pub struct RateLimiterManager {
    limiter: Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
}

impl RateLimiterManager {
    pub fn new(requests_per_second: u32) -> Self {
        let quota = Quota::per_second(std::num::NonZeroU32::new(requests_per_second).unwrap());
        let limiter = RateLimiter::direct(quota);
        
        Self {
            limiter: Arc::new(limiter),
        }
    }
    
    pub fn check(&self) -> bool {
        self.limiter.check().is_ok()
    }
    
    pub async fn wait(&self) {
        self.limiter.until_ready().await;
    }
}

// ============================================================
// Timeout Manager
// ============================================================

pub struct TimeoutManager {
    default_timeout: Duration,
}

impl TimeoutManager {
    pub fn new(default_timeout: Duration) -> Self {
        Self { default_timeout }
    }
    
    pub async fn execute<F, T>(&self, f: F) -> Result<T, String>
    where
        F: std::future::Future<Output = T>,
    {
        match timeout(self.default_timeout, f).await {
            Ok(result) => Ok(result),
            Err(_) => Err(format!("Operation timed out after {:?}", self.default_timeout)),
        }
    }
    
    pub async fn execute_with_timeout<F, T>(&self, f: F, custom_timeout: Duration) -> Result<T, String>
    where
        F: std::future::Future<Output = T>,
    {
        match timeout(custom_timeout, f).await {
            Ok(result) => Ok(result),
            Err(_) => Err(format!("Operation timed out after {:?}", custom_timeout)),
        }
    }
}

// ============================================================
// Bulkhead (Resource Isolation)
// ============================================================

pub struct Bulkhead {
    max_concurrent: usize,
    current: Arc<RwLock<usize>>,
}

impl Bulkhead {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            max_concurrent,
            current: Arc::new(RwLock::new(0)),
        }
    }
    
    pub fn try_acquire(&self) -> Option<BulkheadGuard> {
        let mut current = self.current.write();
        
        if *current < self.max_concurrent {
            *current += 1;
            Some(BulkheadGuard {
                bulkhead: self.current.clone(),
            })
        } else {
            None
        }
    }
    
    pub fn current(&self) -> usize {
        *self.current.read()
    }
    
    pub fn available(&self) -> usize {
        self.max_concurrent - *self.current.read()
    }
}

pub struct BulkheadGuard {
    bulkhead: Arc<RwLock<usize>>,
}

impl Drop for BulkheadGuard {
    fn drop(&mut self) {
        let mut current = self.bulkhead.write();
        *current -= 1;
    }
}

// ============================================================
// Resilient Executor (combines all patterns)
// ============================================================

pub struct ResilientExecutor {
    circuit_breaker: Arc<CircuitBreaker>,
    retry_policy: RetryPolicy,
    rate_limiter: Arc<RateLimiterManager>,
    timeout_manager: TimeoutManager,
    bulkhead: Arc<Bulkhead>,
}

impl ResilientExecutor {
    pub fn new(
        failure_threshold: usize,
        success_threshold: usize,
        circuit_timeout: Duration,
        rate_limit: u32,
        request_timeout: Duration,
        max_concurrent: usize,
    ) -> Self {
        Self {
            circuit_breaker: Arc::new(CircuitBreaker::new(
                failure_threshold,
                success_threshold,
                circuit_timeout,
            )),
            retry_policy: RetryPolicy::default(),
            rate_limiter: Arc::new(RateLimiterManager::new(rate_limit)),
            timeout_manager: TimeoutManager::new(request_timeout),
            bulkhead: Arc::new(Bulkhead::new(max_concurrent)),
        }
    }
    
    pub async fn execute<F, Fut, T, E>(&self, f: F) -> Result<T, String>
    where
        F: Fn() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = Result<T, E>> + Send,
        E: std::fmt::Display,
    {
        // Check circuit breaker
        if self.circuit_breaker.is_open() {
            return Err("Circuit breaker is open".to_string());
        }
        
        // Check rate limit
        if !self.rate_limiter.check() {
            return Err("Rate limit exceeded".to_string());
        }
        
        // Try to acquire bulkhead slot
        let _guard = self.bulkhead.try_acquire()
            .ok_or_else(|| "Too many concurrent requests".to_string())?;
        
        // Execute with retry and timeout
        let result = self.retry_policy.execute(|| async {
            self.timeout_manager.execute(f()).await
                .map_err(|e| e.to_string())
        }).await;
        
        // Record result in circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success(),
            Err(_) => self.circuit_breaker.record_failure(),
        }
        
        result.map_err(|e| e.to_string())
    }
}

