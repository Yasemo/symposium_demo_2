#!/bin/bash

# Cloud Run Deployment Script for Symposium Demo
# This script builds and deploys the application with auto-provisioning

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_NAME="symposium-demo"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi

    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi

    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 > /dev/null; then
        log_error "Not authenticated with gcloud. Please run 'gcloud auth login' first."
        exit 1
    fi

    # Set project
    gcloud config set project ${PROJECT_ID}

    log_success "Prerequisites check passed"
}

# Enable required APIs
enable_apis() {
    log_info "Enabling required GCP APIs..."

    APIs=(
        "run.googleapis.com"
        "sqladmin.googleapis.com"
        "redis.googleapis.com"
        "storage-api.googleapis.com"
        "containerregistry.googleapis.com"
        "cloudbuild.googleapis.com"
    )

    for api in "${APIs[@]}"; do
        log_info "Enabling ${api}..."
        gcloud services enable ${api} --quiet
    done

    log_success "All required APIs enabled"
}

# Build and push Docker image
build_and_push() {
    log_info "Building and pushing Docker image..."

    # Build the image
    docker build -t ${IMAGE_NAME}:latest .

    # Configure Docker to use gcloud as a credential helper
    gcloud auth configure-docker --quiet

    # Push the image
    docker push ${IMAGE_NAME}:latest

    log_success "Docker image built and pushed: ${IMAGE_NAME}:latest"
}

# Create service account for the application
create_service_account() {
    log_info "Creating service account for auto-provisioning..."

    SERVICE_ACCOUNT_NAME="${SERVICE_NAME}-provisioner"
    SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

    # Create service account if it doesn't exist
    if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT_EMAIL} &> /dev/null; then
        gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
            --description="Service account for Symposium Demo auto-provisioning" \
            --display-name="Symposium Provisioner"
    fi

    # Grant necessary permissions
    log_info "Granting permissions to service account..."
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/cloudsql.admin"

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/redis.admin"

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/storage.admin"

    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
        --role="roles/monitoring.viewer"

    # Create and download key
    if [ ! -f "service-account-key.json" ]; then
        log_info "Creating service account key..."
        gcloud iam service-accounts keys create service-account-key.json \
            --iam-account=${SERVICE_ACCOUNT_EMAIL}
        log_warning "Service account key saved to service-account-key.json - Keep this secure!"
    else
        log_info "Service account key already exists"
    fi

    log_success "Service account configured"
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    log_info "Deploying to Cloud Run..."

    # Base64 encode the service account key for environment variable
    if [ -f "service-account-key.json" ]; then
        SERVICE_ACCOUNT_KEY_B64=$(base64 -w 0 service-account-key.json)
    else
        log_error "Service account key not found. Please run the full deployment process."
        exit 1
    fi

    # Deploy the service
    gcloud run deploy ${SERVICE_NAME} \
        --image=${IMAGE_NAME}:latest \
        --platform=managed \
        --region=${REGION} \
        --allow-unauthenticated \
        --port=8080 \
        --memory=2Gi \
        --cpu=2 \
        --max-instances=10 \
        --min-instances=1 \
        --concurrency=50 \
        --timeout=900 \
        --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID}" \
        --set-env-vars="GCP_REGION=${REGION}" \
        --set-env-vars="GCP_SERVICE_ACCOUNT_KEY=${SERVICE_ACCOUNT_KEY_B64}" \
        --set-env-vars="ENVIRONMENT=production" \
        --set-env-vars="PROVISIONING_MODE=auto" \
        --set-env-vars="COST_LIMIT=100" \
        --set-env-vars="PORT=8080"

    # Get the service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")

    log_success "Deployment completed!"
    log_info "Service URL: ${SERVICE_URL}"
    log_info "Health check: ${SERVICE_URL}/api/health"
    log_info "Metrics: ${SERVICE_URL}/api/metrics"
}

# Main deployment process
main() {
    echo "🚀 Symposium Demo - Cloud Run Auto-Provisioning Deployment"
    echo "======================================================"

    # Check if this is a full deployment or just an update
    if [ "$1" = "--update" ]; then
        log_info "Performing update deployment..."
        check_prerequisites
        build_and_push
        deploy_to_cloud_run
    else
        log_info "Performing full deployment with auto-provisioning setup..."
        check_prerequisites
        enable_apis
        create_service_account
        build_and_push
        deploy_to_cloud_run
    fi

    echo ""
    log_success "🎉 Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Visit your service URL to access the application"
    echo "2. Check /api/metrics for resource usage monitoring"
    echo "3. Monitor GCP costs in the billing console"
    echo "4. For updates, run: ./deploy-cloud-run.sh --update"
}

# Handle command line arguments
case "$1" in
    --help|-h)
        echo "Usage: $0 [--update]"
        echo ""
        echo "Options:"
        echo "  --update    Update existing deployment without recreating service account"
        echo "  --help      Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  GCP_PROJECT_ID    Your Google Cloud Project ID (required)"
        echo "  GCP_REGION        Deployment region (default: us-central1)"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
