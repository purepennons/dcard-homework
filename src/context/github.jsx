import React, { createContext, Component } from 'react';
import { pick, get, isFinite } from 'lodash';
import Bottleneck from 'bottleneck';

import client from '../apollo/';
import { QUERY_REPOS } from '../apollo/gql';
import { NOT_FOUND_ERROR } from '../constants/error';

const cx = createContext({});

const limiter = new Bottleneck(1, 6000);

class Provider extends Component {
  defaultValues = {
    isLoading: false,
    keyword: '',
    repos: [],
    nextPage: 1,
    perPage: 10,
    error: null
  };

  constructor(props) {
    super(props);
    this.fetchPromise = null;
    this.state = {
      ...this.defaultValues,
      actions: {
        setKeyword: this.setKeyword,
        setLoadingState: this.setLoadingState,
        setPerPage: this.setPerPage,
        setError: this.setError,
        searchRepos: this.searchRepos,
        fetchMore: this.fetchMore,
        addRepos: this.addRepos,
        resetRepos: this.resetRepos
      }
    };
  }

  _setStateAsync = nextState => {
    return new Promise(resolve => this.setState(nextState, () => resolve()));
  };

  setKeyword = keyword => {
    return this._setStateAsync(_ => ({ keyword }));
  };

  setLoadingState = (isLoading = false) => this._setStateAsync({ isLoading });

  setPerPage = (perPage = this.defaultValues.perPage) => {
    return this._setStateAsync(prev => ({
      perPage: isFinite(perPage) ? parseInt(perPage, 10) : prev.perPage
    }));
  };

  setError = ({ desc, code, obj }) => {
    return this._setStateAsync({ error: { desc, code, obj } });
  };

  searchRepos = async () => {
    await this.resetRepos(['repos', 'nextPage', 'error']);
    await this.fetchMore();
  };

  fetchMore = async () => {
    const { keyword, nextPage, perPage } = this.state;
    await this.resetRepos(['error']);

    if (!keyword) return;

    await this.setLoadingState(true);
    try {
      const { data } = await limiter.schedule(() =>
        client.query({
          query: QUERY_REPOS,
          variables: {
            keyword,
            perPage,
            page: nextPage
          }
        })
      );
      const repos = get(data, ['searchRepos', 'items']);
      if (!repos || repos.length < 1) throw NOT_FOUND_ERROR;

      await Promise.all([
        this._setStateAsync(prev => ({ nextPage: prev.nextPage + 1 })),
        this.addRepos(repos)
      ]);
    } catch (error) {
      this.setError({
        desc: error.desc,
        code: error.code,
        obj: error
      });
    } finally {
      await this.setLoadingState(false);
    }
  };

  addRepos = repos => {
    if (!repos) return;
    return this._setStateAsync(prev => ({ repos: prev.repos.concat(repos) }));
  };

  resetRepos = (fields = []) => {
    return this._setStateAsync(
      _ =>
        fields.length === 0
          ? this.defaultValues
          : pick(this.defaultValues, fields)
    );
  };

  render() {
    return <cx.Provider value={this.state}>{this.props.children}</cx.Provider>;
  }
}

export default {
  Provider: Provider,
  Consumer: cx.Consumer
};
