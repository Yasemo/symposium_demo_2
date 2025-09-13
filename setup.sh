#!/bin/bash

# Symposium Demo Setup Script
# Helps configure the application for local development

set -e

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

# Check if .env file exists
check_env_file() {
    if [ -f ".env" ]; then
        log_info ".env file already exists"
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Keeping existing .env file"
            return 1
        fi
    fi
    return 0
}

# Create .env file from template
create_env_file() {
    log_info "Creating .env file from template..."

    if [ ! -f ".env.example" ]; then
        log_error ".env.example file not found!"
        exit 1
    fi

    cp .env.example .env
    log_success ".env file created successfully"
}

# Interactive setup for GCP configuration
setup_gcp_config() {
    log_info "Setting up GCP configuration..."

    echo
    echo "Do you want to configure GCP services for local development?"
    echo "This will allow you to use Cloud SQL, Memorystore, and Cloud Storage locally."
    echo
    read -p "Configure GCP services? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Get GCP project ID
        read -p "Enter your GCP Project ID: " GCP_PROJECT_ID
        if [ -z "$GCP_PROJECT_ID" ]; then
            log_warning "No GCP Project ID provided, skipping GCP configuration"
            return
        fi

        # Get service account key path
        echo
        echo "You need a GCP Service Account Key for auto-provisioning."
        echo "1. Go to GCP Console > IAM & Admin > Service Accounts"
        echo "2. Create a service account or select existing one"
        echo "3. Generate a new key (JSON format)"
        echo "4. Download the key file"
        echo
        read -p "Enter the path to your service account key file: " KEY_FILE_PATH

        if [ ! -f "$KEY_FILE_PATH" ]; then
            log_error "Service account key file not found: $KEY_FILE_PATH"
            log_warning "You can manually add the key later by editing the .env file"
            return
        fi

        # Base64 encode the key
        log_info "Encoding service account key..."
        GCP_SERVICE_ACCOUNT_KEY=$(base64 -w 0 "$KEY_FILE_PATH")

        # Update .env file
        sed -i.bak "s/your-project-id/$GCP_PROJECT_ID/g" .env
        sed -i.bak "s/your-base64-encoded-service-account-key/$GCP_SERVICE_ACCOUNT_KEY/g" .env

        log_success "GCP configuration updated in .env file"
        log_warning "Keep your service account key secure and never commit it to version control"
    else
        log_info "Skipping GCP configuration - using local services only"
        echo "You can change this later by editing the .env file"
    fi
}

# Setup provisioning mode
setup_provisioning_mode() {
    echo
    echo "Choose your provisioning mode:"
    echo "1. auto    - Automatically provision GCP services when needed"
    echo "2. manual  - Use existing GCP services (provide connection details)"
    echo "3. disabled- Use only local services (no GCP)"
    echo
    read -p "Enter your choice (1-3) [1]: " -n 1 -r
    echo

    case $REPLY in
        1)
            PROVISIONING_MODE="auto"
            ;;
        2)
            PROVISIONING_MODE="manual"
            ;;
        3|"")
            PROVISIONING_MODE="disabled"
            ;;
        *)
            log_warning "Invalid choice, using 'auto' as default"
            PROVISIONING_MODE="auto"
            ;;
    esac

    # Update .env file
    sed -i.bak "s/PROVISIONING_MODE=.*/PROVISIONING_MODE=$PROVISIONING_MODE/g" .env
    log_success "Provisioning mode set to: $PROVISIONING_MODE"
}

# Setup Gemini API key
setup_gemini_key() {
    echo
    echo "Do you have a Gemini API key from Google AI Studio?"
    echo "(You can get one at: https://makersuite.google.com/app/apikey)"
    echo
    read -p "Enter your Gemini API key (or press Enter to skip): " GEMINI_API_KEY

    if [ -n "$GEMINI_API_KEY" ]; then
        sed -i.bak "s/your-gemini-api-key/$GEMINI_API_KEY/g" .env
        log_success "Gemini API key configured"
    else
        log_warning "No Gemini API key provided - some features may not work"
        log_info "You can add it later by editing the .env file"
    fi
}

# Test the configuration
test_configuration() {
    log_info "Testing configuration..."

    # Check if Deno is installed
    if ! command -v deno &> /dev/null; then
        log_error "Deno is not installed!"
        log_info "Please install Deno first: https://deno.land/manual/getting_started/installation"
        exit 1
    fi

    # Check Deno version
    DENO_VERSION=$(deno --version | head -n 1 | cut -d' ' -f2)
    log_info "Deno version: $DENO_VERSION"

    # Test environment loading
    log_info "Testing environment configuration..."
    if deno run --allow-read --allow-env src/env-loader.ts &> /dev/null; then
        log_success "Environment configuration is valid"
    else
        log_error "Environment configuration has issues"
        log_info "Please check your .env file for any syntax errors"
    fi
}

# Display next steps
show_next_steps() {
    echo
    log_success "🎉 Setup completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Review and customize your .env file if needed"
    echo "2. Run the application:"
    echo "   deno run --allow-all --unstable-kv main.ts"
    echo "3. Open http://localhost:8000 in your browser"
    echo "4. Check metrics at http://localhost:8000/api/metrics"
    echo
    echo "For production deployment:"
    echo "1. Run: ./deploy-cloud-run.sh"
    echo "2. Or use Docker: docker build -t symposium-demo ."
    echo
    log_info "Happy coding! 🚀"
}

# Main setup process
main() {
    echo "🚀 Symposium Demo Setup"
    echo "======================"
    echo

    # Check if we should proceed
    if ! check_env_file; then
        exit 0
    fi

    # Create .env file
    create_env_file

    # Setup components
    setup_gcp_config
    setup_provisioning_mode
    setup_gemini_key

    # Test configuration
    test_configuration

    # Show next steps
    show_next_steps
}

# Handle command line arguments
case "$1" in
    --help|-h)
        echo "Usage: $0"
        echo ""
        echo "This script helps you set up the Symposium Demo application"
        echo "by creating and configuring a .env file for local development."
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo "  --quick       Quick setup with minimal prompts"
        exit 0
        ;;
    --quick)
        log_info "Running quick setup..."
        if check_env_file; then
            create_env_file
            log_success "Quick setup completed!"
            echo "Edit the .env file with your configuration as needed."
        fi
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
